import { useState, useCallback, useMemo } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect, unstable_parseMultipartFormData, unstable_createMemoryUploadHandler } from "@remix-run/node";
import { useActionData, useNavigation, useSubmit, useLoaderData } from "@remix-run/react";
import {
    Page, Layout, Card, TextField, Button, BlockStack, DropZone, Banner, Text, Combobox, Listbox, Icon, Link, InlineStack, RadioButton
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { parseCSV } from "../utils/csv-parser.server";
import prisma from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    const { admin } = await authenticate.admin(request);
    const offerId = Number(params.id);

    const offer = await prisma.offer.findUnique({
        where: { id: offerId },
    });

    if (!offer) {
        throw new Response("Not Found", { status: 404 });
    }

    if (offer.status !== "PENDING") {
        throw new Response("Offer cannot be edited", { status: 400 });
    }

    // Fetch vendors for autocomplete
    const response = await admin.graphql(`{
    shop {
      productVendors(first: 250) {
        edges {
          node
        }
      }
    }
  }`);
    const data = await response.json();
    const vendors = data.data.shop.productVendors.edges.map((edge: any) => edge.node);

    return json({ offer, vendors });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
    const { admin } = await authenticate.admin(request);
    const offerId = Number(params.id);

    const uploadHandler = unstable_createMemoryUploadHandler({
        maxPartSize: 5_000_000,
    });

    const formData = await unstable_parseMultipartFormData(request, uploadHandler);

    const title = formData.get("title") as string;
    const vendor = formData.get("vendor") as string;
    const priceType = formData.get("priceType") as string;
    const pricingFormat = formData.get("pricingFormat") as string;
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;
    const tags = formData.get("tags") as string;
    const markupStr = formData.get("markup") as string;
    const discountStr = formData.get("discount") as string;
    const file = formData.get("file") as File;

    if (!title || !vendor || !priceType || !pricingFormat) {
        return json({ error: "Missing required fields" }, { status: 400 });
    }

    if (priceType === "OFFER" && (!startDate || !endDate)) {
        return json({ error: "Start and End dates are required for Offer price type" }, { status: 400 });
    }

    if (pricingFormat === "BASE" && (!markupStr || !discountStr)) {
        return json({ error: "Markup and Discount are required for Base pricing format" }, { status: 400 });
    }

    const markup = markupStr ? parseFloat(markupStr) : 0;
    const discount = discountStr ? parseFloat(discountStr) : 0;

    const updateData: any = {
        title,
        vendor,
        priceType,
        pricingFormat,
        markup: pricingFormat === "BASE" ? markup : null,
        discount: pricingFormat === "BASE" ? discount : null,
        startDate: priceType === "OFFER" ? (startDate ? new Date(startDate) : null) : null,
        endDate: priceType === "OFFER" ? (endDate ? new Date(endDate) : null) : null,
        tags: tags || "",
    };

    // If file is provided, parse and replace items
    if (file && file.size > 0) {
        const fileContent = await file.text();
        let items;
        try {
            items = parseCSV(fileContent, pricingFormat);
        } catch (e: any) {
            return json({ error: `Invalid CSV: ${e.message}` }, { status: 400 });
        }

        updateData.items = {
            deleteMany: {}, // Delete existing items
            create: items.map((item) => {
                let offerPrice = parseFloat(item.price);
                if (pricingFormat === "BASE") {
                    const basePrice = parseFloat(item.price);
                    offerPrice = (basePrice * markup) * (1 - discount / 100);
                }
                return {
                    sku: item.sku,
                    offerPrice
                };
            }),
        };
    }

    await prisma.offer.update({
        where: { id: offerId },
        data: updateData,
    });

    return redirect(`/app/offers/${offerId}`);
};

export default function EditOffer() {
    const { offer, vendors } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const submit = useSubmit();
    const nav = useNavigation();
    const isSubmitting = nav.state === "submitting";

    const [title, setTitle] = useState(offer.title || "");
    const [priceType, setPriceType] = useState(offer.priceType || "OFFER");
    const [pricingFormat, setPricingFormat] = useState(offer.pricingFormat || "ACTUAL");
    const [startDate, setStartDate] = useState(offer.startDate ? new Date(offer.startDate).toISOString().split('T')[0] : "");
    const [endDate, setEndDate] = useState(offer.endDate ? new Date(offer.endDate).toISOString().split('T')[0] : "");
    const [markup, setMarkup] = useState(offer.markup ? offer.markup.toString() : "1.0");
    const [discount, setDiscount] = useState(offer.discount ? offer.discount.toString() : "0");
    const [tags, setTags] = useState(offer.tags || "");
    const [file, setFile] = useState<File | null>(null);

    // Vendor Autocomplete State
    const [selectedVendor, setSelectedVendor] = useState(offer.vendor);
    const [inputValue, setInputValue] = useState(offer.vendor);
    const [options, setOptions] = useState(vendors);

    const updateText = useCallback(
        (value: string) => {
            setInputValue(value);

            if (value === "") {
                setOptions(vendors);
                return;
            }

            const filterRegex = new RegExp(value, 'i');
            const resultOptions = vendors.filter((option: string) =>
                option.match(filterRegex),
            );
            setOptions(resultOptions);
        },
        [vendors],
    );

    const updateSelection = useCallback(
        (selected: string) => {
            const matchedOption = options.find((option: string) => {
                return option.match(selected);
            });

            setSelectedVendor(selected);
            setInputValue(matchedOption || selected);
        },
        [options],
    );

    const handleDrop = (_droppedFiles: File[], acceptedFiles: File[], _rejectedFiles: File[]) => {
        setFile(acceptedFiles[0]);
    };

    const handleSubmit = () => {
        const formData = new FormData();
        formData.append("title", title);
        formData.append("vendor", selectedVendor || inputValue);
        formData.append("priceType", priceType);
        formData.append("pricingFormat", pricingFormat);
        if (priceType === "OFFER") {
            formData.append("startDate", startDate);
            formData.append("endDate", endDate);
        }
        if (pricingFormat === "BASE") {
            formData.append("markup", markup);
            formData.append("discount", discount);
        }
        formData.append("tags", tags);
        if (file) formData.append("file", file);

        submit(formData, { method: "post", encType: "multipart/form-data" });
    };

    const optionsMarkup =
        options.length > 0
            ? options.map((option: string) => {
                return (
                    <Listbox.Option
                        key={option}
                        value={option}
                        selected={selectedVendor === option}
                        accessibilityLabel={option}
                    >
                        {option}
                    </Listbox.Option>
                );
            })
            : null;

    return (
        <Page
            title="Edit Offer"
            backAction={{ content: "Back", url: `/app/offers/${offer.id}` }}
            primaryAction={{
                content: "Save Changes",
                onAction: handleSubmit,
                loading: isSubmitting,
                disabled: isSubmitting,
            }}
        >
            <Layout>
                <Layout.Section>
                    {actionData?.error && (
                        <Banner tone="critical">
                            <p>{actionData.error}</p>
                        </Banner>
                    )}
                    <Card>
                        <BlockStack gap="500">
                            <Banner tone="info">
                                <p>Editing a pending offer. Uploading a new CSV will replace the existing items.</p>
                            </Banner>
                            <TextField
                                label="Offer Title"
                                value={title}
                                onChange={setTitle}
                                autoComplete="off"
                            />
                            <Combobox
                                activator={
                                    <Combobox.TextField
                                        prefix={<Icon source={SearchIcon} />}
                                        onChange={updateText}
                                        label="Vendor"
                                        value={inputValue}
                                        placeholder="Search or enter vendor"
                                        autoComplete="off"
                                    />
                                }
                            >
                                {options.length > 0 ? (
                                    <Listbox onSelect={updateSelection}>{optionsMarkup}</Listbox>
                                ) : null}
                            </Combobox>

                            <BlockStack gap="200">
                                <Text as="h3" variant="headingSm">Price Type</Text>
                                <InlineStack gap="400">
                                    <RadioButton
                                        label="Offer Price (Temporary)"
                                        checked={priceType === "OFFER"}
                                        id="priceTypeOffer"
                                        name="priceType"
                                        onChange={() => setPriceType("OFFER")}
                                    />
                                    <RadioButton
                                        label="Regular Price (Permanent)"
                                        checked={priceType === "REGULAR"}
                                        id="priceTypeRegular"
                                        name="priceType"
                                        onChange={() => setPriceType("REGULAR")}
                                    />
                                </InlineStack>
                            </BlockStack>

                            {priceType === "OFFER" && (
                                <BlockStack gap="400">
                                    <TextField
                                        label="Start Date (YYYY-MM-DD)"
                                        value={startDate}
                                        onChange={setStartDate}
                                        autoComplete="off"
                                        type="date"
                                    />
                                    <TextField
                                        label="End Date (YYYY-MM-DD)"
                                        value={endDate}
                                        onChange={setEndDate}
                                        autoComplete="off"
                                        type="date"
                                    />
                                </BlockStack>
                            )}

                            <BlockStack gap="200">
                                <Text as="h3" variant="headingSm">Pricing Format</Text>
                                <InlineStack gap="400">
                                    <RadioButton
                                        label="Actual Price (in CSV)"
                                        checked={pricingFormat === "ACTUAL"}
                                        id="pricingFormatActual"
                                        name="pricingFormat"
                                        onChange={() => setPricingFormat("ACTUAL")}
                                    />
                                    <RadioButton
                                        label="Base Price (Calculate with Formula)"
                                        checked={pricingFormat === "BASE"}
                                        id="pricingFormatBase"
                                        name="pricingFormat"
                                        onChange={() => setPricingFormat("BASE")}
                                    />
                                </InlineStack>
                            </BlockStack>

                            {pricingFormat === "BASE" && (
                                <BlockStack gap="400">
                                    <TextField
                                        label="Markup (Decimal, e.g. 1.5 for 50% markup)"
                                        value={markup}
                                        onChange={setMarkup}
                                        autoComplete="off"
                                        type="number"
                                        step={0.01}
                                    />
                                    <TextField
                                        label="Discount (%)"
                                        value={discount}
                                        onChange={setDiscount}
                                        autoComplete="off"
                                        type="number"
                                        suffix="%"
                                    />
                                </BlockStack>
                            )}
                            <TextField
                                label="Tags"
                                value={tags}
                                onChange={setTags}
                                autoComplete="off"
                                helpText="Comma separated tags"
                            />

                            <BlockStack gap="200">
                                <BlockStack gap="200">
                                    <Text as="p" variant="bodyMd">Upload Items CSV</Text>
                                    <InlineStack gap="200">
                                        <Link url="/app/sample-csv?type=actual" target="_blank">Sample CSV (Actual Price)</Link>
                                        <Link url="/app/sample-csv?type=base" target="_blank">Sample CSV (Base Price)</Link>
                                    </InlineStack>
                                </BlockStack>
                                <DropZone onDrop={handleDrop} allowMultiple={false} accept=".csv, text/csv">
                                    {file ? (
                                        <BlockStack>
                                            <Text as="p" variant="bodyMd">{file.name} ({(file.size / 1024).toFixed(2)} KB)</Text>
                                        </BlockStack>
                                    ) : (
                                        <DropZone.FileUpload actionHint="Upload to replace items" />
                                    )}
                                </DropZone>
                            </BlockStack>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
