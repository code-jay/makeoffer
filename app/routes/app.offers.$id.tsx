import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { Page, Layout, Card, Text, Badge, BlockStack, DataTable } from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { applyOfferPrices, revertOfferPrices } from "../services/price-updater.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
    const { admin } = await authenticate.admin(request);
    const offerId = Number(params.id);

    const offer = await prisma.offer.findUnique({
        where: { id: offerId },
        include: { items: true },
    });

    if (!offer) {
        throw new Response("Not Found", { status: 404 });
    }

    // If Pending, fetch current prices for display
    const itemsWithCurrentPrice = await Promise.all(offer.items.map(async (item) => {
        let currentPrice = item.originalPrice;
        if (!currentPrice && offer.status === "PENDING") {
            const query = `
            query {
                productVariants(first: 1, query: "sku:${item.sku}") {
                    edges {
                        node {
                            price
                        }
                    }
                }
            }
          `;
            const response = await admin.graphql(query);
            const data = await response.json();
            const variant = data.data.productVariants.edges[0]?.node;
            if (variant) {
                currentPrice = variant.price;
            }
        }
        return {
            ...item,
            displayOriginalPrice: currentPrice
        };
    }));

    return json({ offer, items: itemsWithCurrentPrice });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
    const { admin } = await authenticate.admin(request);
    const offerId = Number(params.id);
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "activate") {
        await applyOfferPrices(admin, offerId);
    } else if (intent === "revert") {
        await revertOfferPrices(admin, offerId);
    }

    return json({ success: true });
};

export default function OfferDetail() {
    const { offer, items } = useLoaderData<typeof loader>();
    const submit = useSubmit();
    const nav = useNavigation();
    const isSubmitting = nav.state === "submitting";

    const rows = items.map((item: any) => [
        item.sku,
        item.displayOriginalPrice ? item.displayOriginalPrice.toString() : "-",
        item.offerPrice.toString(),
        // Calculate discount percentage/amount for fanciness?
        // Let's stick to basic requirement.
    ]);

    const secondaryActions = [];
    if (offer.status === "PENDING") {
        secondaryActions.push({
            content: "Activate Offer",
            onAction: () => submit({ intent: "activate" }, { method: "post" }),
            loading: isSubmitting
        });
    } else if (offer.status === "ACTIVE") {
        secondaryActions.push({
            content: "Revert Offer",
            onAction: () => submit({ intent: "revert" }, { method: "post" }),
            loading: isSubmitting
        });
    }

    return (
        <Page
            title={offer.title ? `${offer.title} (${offer.vendor})` : `Offer: ${offer.vendor}`}
            backAction={{ content: "Offers", url: "/app" }}
            secondaryActions={secondaryActions}
        >
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <BlockStack gap="200">
                                <Text as="h2" variant="headingMd">Details</Text>
                                <Text as="p" variant="bodyMd">
                                    <strong>Status: </strong>
                                    <Badge tone={offer.status === "ACTIVE" ? "success" : offer.status === "COMPLETED" ? "info" : "attention"}>
                                        {offer.status}
                                    </Badge>
                                </Text>
                                {offer.title && <Text as="p" variant="bodyMd"><strong>Title:</strong> {offer.title}</Text>}
                                <Text as="p" variant="bodyMd"><strong>Start Date:</strong> {new Date(offer.startDate).toLocaleDateString()}</Text>
                                <Text as="p" variant="bodyMd"><strong>End Date:</strong> {new Date(offer.endDate).toLocaleDateString()}</Text>
                                <Text as="p" variant="bodyMd"><strong>Tags:</strong> {offer.tags}</Text>
                            </BlockStack>

                            <BlockStack gap="200">
                                <Text as="h2" variant="headingMd">Items ({items.length})</Text>
                                <DataTable
                                    columnContentTypes={["text", "numeric", "numeric"]}
                                    headings={["SKU", "Original/Current Price", "Offer Price"]}
                                    rows={rows}
                                />
                            </BlockStack>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}

export function ErrorBoundary() {
    const error = useRouteError();

    if (isRouteErrorResponse(error) && error.status === 404) {
        return (
            <Page title="Offer Not Found">
                <Layout>
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="200">
                                <Text as="h2" variant="headingMd">Offer Not Found</Text>
                                <Text as="p" variant="bodyMd">The offer you are looking for does not exist or has been deleted.</Text>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    return (
        <Page title="Error">
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="200">
                            <Text as="h2" variant="headingMd">Something went wrong</Text>
                            <Text as="p" variant="bodyMd">Please try again later.</Text>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
