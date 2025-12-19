import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { useEffect } from "react";
import {
    Page,
    Layout,
    Text,
    Card,
    Button,
    BlockStack,
    ResourceList,
    ResourceItem,
    Badge,
    Banner,
    EmptyState
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { applyOfferPrices, revertOfferPrices } from "../services/price-updater.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { admin } = await authenticate.admin(request);
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = 5;
    const skip = (page - 1) * pageSize;

    const [offersRaw, totalCount] = await Promise.all([
        prisma.offer.findMany({
            orderBy: { createdAt: "desc" },
            take: pageSize,
            skip: skip,
            include: { items: { take: 1 } },
        }),
        prisma.offer.count(),
    ]);

    const skus = offersRaw
        .map((offer) => offer.items[0]?.sku)
        .filter((sku): sku is string => !!sku);

    const skuToProductTitle: Record<string, string> = {};

    if (skus.length > 0) {
        const uniqueSkus = [...new Set(skus)];
        const queryFilter = uniqueSkus.map((sku) => `sku:"${sku.replace(/"/g, '\\"')}"`).join(" OR ");

        const response = await admin.graphql(
            `#graphql
            query getProductTitles($query: String!) {
                productVariants(first: 50, query: $query) {
                    edges {
                        node {
                            sku
                            product {
                                title
                            }
                        }
                    }
                }
            }`,
            { variables: { query: queryFilter } }
        );

        const data = await response.json();
        const variants = data.data.productVariants.edges;

        variants.forEach((edge: any) => {
            const sku = edge.node.sku;
            const title = edge.node.product.title;
            if (sku && title) {
                skuToProductTitle[sku] = title;
            }
        });
    }

    const offers = offersRaw.map(offer => ({
        ...offer,
        productTitle: offer.items[0] ? skuToProductTitle[offer.items[0].sku] : undefined
    }));

    const totalPages = Math.ceil(totalCount / pageSize);

    return json({ offers, page, totalPages, totalCount });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "run-job") {
        // Scheduler simulation
        const now = new Date();

        const pendingOffers = await prisma.offer.findMany({
            where: {
                status: "PENDING",
                startDate: { lte: now }
            },
            include: { items: true }
        });

        for (const offer of pendingOffers) {
            console.log(`Activating offer ${offer.id}`);
            await applyOfferPrices(admin, offer.id);
        }

        const activeOffers = await prisma.offer.findMany({
            where: {
                status: "ACTIVE",
                endDate: { lt: now }
            },
            include: { items: true }
        });

        for (const offer of activeOffers) {
            console.log(`Completing offer ${offer.id}`);
            await revertOfferPrices(admin, offer.id);
        }

        return json({ message: `Job ran. Activated: ${pendingOffers.length}, Reverted: ${activeOffers.length}` });
    }

    return json({ message: "Success" });
};


export default function OffersList() {
    const { offers, page, totalPages, totalCount } = useLoaderData<typeof loader>();
    const navigate = useNavigate();
    const fetcher = useFetcher<typeof action>();
    const isLoading = fetcher.state === "submitting";
    const message = fetcher.data?.message;

    useEffect(() => {
        if (message) {
            shopify.toast.show(message);
        }
    }, [message]);

    const handlePrevious = () => {
        if (page > 1) {
            navigate(`?page=${page - 1}`);
        }
    };

    const handleNext = () => {
        if (page < totalPages) {
            navigate(`?page=${page + 1}`);
        }
    };

    return (
        <Page
            title="Offers"
            primaryAction={{
                content: "Create Offer",
                url: "/app/offers/new",
            }}
            secondaryActions={[
                <Button onClick={() => fetcher.submit({ intent: "run-job" }, { method: "post" })} loading={isLoading}>
                    Run Scheduler Job
                </Button>
            ]}
        >
            <Layout>
                <Layout.Section>
                    <Card padding="0">
                        <ResourceList
                            resourceName={{ singular: "offer", plural: "offers" }}
                            items={offers}
                            renderItem={(item) => {
                                const { id, title, vendor, startDate, endDate, status, tags, productTitle } = item;
                                const media = <Badge tone={status === "ACTIVE" ? "success" : status === "COMPLETED" ? "info" : "attention"}>{status}</Badge>;

                                return (
                                    <ResourceItem
                                        id={id.toString()}
                                        url={`/app/offers/${id}`}
                                        media={media}
                                        accessibilityLabel={`View details for ${vendor}`}
                                        onClick={() => navigate(`/app/offers/${id}`)}
                                    >
                                        <Text variant="bodyMd" fontWeight="bold" as="h3">
                                            {title ? `${title} (${vendor})` : vendor}
                                        </Text>
                                        <BlockStack gap="200">
                                            {productTitle && (
                                                <Text as="p" variant="bodySm" tone="base">
                                                    {productTitle}
                                                </Text>
                                            )}
                                            {startDate && endDate ? (
                                                <Text as="p" variant="bodySm" tone="subdued">
                                                    {new Date(startDate).toLocaleDateString()} - {new Date(endDate).toLocaleDateString()}
                                                </Text>
                                            ) : (
                                                <Text as="p" variant="bodySm" tone="subdued">
                                                    Permanent (Regular Price)
                                                </Text>
                                            )}
                                            {tags && <Text as="p" variant="bodySm">{tags}</Text>}
                                        </BlockStack>
                                    </ResourceItem>
                                );
                            }}
                            pagination={{
                                hasPrevious: page > 1,
                                hasNext: page < totalPages,
                                onPrevious: handlePrevious,
                                onNext: handleNext,
                                label: `${page} of ${totalPages} pages`
                            }}
                            emptyState={
                                <EmptyState
                                    heading="Create your first offer"
                                    action={{ content: 'Create Offer', url: '/app/offers/new' }}
                                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                                >
                                    <p>Track and manage your offers here.</p>
                                </EmptyState>
                            }
                        />
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
