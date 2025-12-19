import { useState, useCallback, useMemo } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect, unstable_parseMultipartFormData, unstable_createMemoryUploadHandler } from "@remix-run/node";
import { useActionData, useNavigation, useSubmit, useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, TextField, Button, BlockStack, DropZone, Banner, Text, Combobox, Listbox, Icon } from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { parseCSV } from "../utils/csv-parser.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { admin } = await authenticate.admin(request);
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
    return json({ vendors });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { admin } = await authenticate.admin(request);
    const uploadHandler = unstable_createMemoryUploadHandler({
        maxPartSize: 5_000_000,
    });

    const formData = await unstable_parseMultipartFormData(request, uploadHandler);

    const title = formData.get("title") as string;
    const vendor = formData.get("vendor") as string;
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;
    const tags = formData.get("tags") as string;
    const file = formData.get("file") as File;

    if (!title || !vendor || !startDate || !endDate || !file) {
        return json({ error: "Missing required fields" }, { status: 400 });
    }

    const fileContent = await file.text();
    let items;
    try {
        items = parseCSV(fileContent);
    } catch (e: any) {
        return json({ error: `Invalid CSV: ${e.message}` }, { status: 400 });
    }

    await prisma.offer.create({
        data: {
            title,
            vendor,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            tags: tags || "",
            status: "PENDING",
            items: {
                create: items.map((item) => ({
                    sku: item.sku,
                    offerPrice: parseFloat(item.price),
                })),
            },
        },
    });

    return redirect("/app");
};

export default function NewOffer() {
    const { vendors } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const submit = useSubmit();
    const nav = useNavigation();
    const isSubmitting = nav.state === "submitting";

    const [title, setTitle] = useState("");
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [tags, setTags] = useState("");
    const [file, setFile] = useState<File | null>(null);

    // Vendor Autocomplete State
    const [selectedVendor, setSelectedVendor] = useState("");
    const [inputValue, setInputValue] = useState("");
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
        formData.append("vendor", selectedVendor || inputValue); // Use selected or typed value
        formData.append("startDate", startDate);
        formData.append("endDate", endDate);
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
            title="Create New Offer"
            primaryAction={{
                content: "Create Offer",
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
                            <TextField
                                label="Offer Title"
                                value={title}
                                onChange={setTitle}
                                autoComplete="off"
                                placeholder="e.g., Summer Sale 2025"
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
                            <TextField
                                label="Tags"
                                value={tags}
                                onChange={setTags}
                                autoComplete="off"
                                helpText="Comma separated tags"
                            />

                            <DropZone onDrop={handleDrop} allowMultiple={false} accept=".csv, text/csv">
                                {file ? (
                                    <BlockStack>
                                        <Text as="p" variant="bodyMd">{file.name} ({(file.size / 1024).toFixed(2)} KB)</Text>
                                    </BlockStack>
                                ) : (
                                    <DropZone.FileUpload />
                                )}
                            </DropZone>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
