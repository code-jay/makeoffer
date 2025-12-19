import { LoaderFunction } from "@remix-run/node";

export const loader: LoaderFunction = async ({ request }) => {
    const url = new URL(request.url);
    const type = url.searchParams.get("type"); // "actual" or "base"

    let csvContent = `sku,Actual Price
SK12345,200.00
sku-snowboard-2,150.00
example-sku-1,10.00`;

    if (type === "base") {
        csvContent = `sku,Base Price
SK12345,100.00
sku-snowboard-2,80.00
example-sku-1,5.00`;
    }

    return new Response(csvContent, {
        headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="sample_${type === "base" ? "base" : "actual"}_offers.csv"`,
        },
    });
};
