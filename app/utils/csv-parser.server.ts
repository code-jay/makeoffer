import { parse } from 'csv-parse/sync';

export interface CSVRow {
    sku: string;
    price: string;
}

export function parseCSV(content: string, pricingFormat: string = "ACTUAL"): CSVRow[] {
    const records = parse(content, {
        columns: (header) => header.map((column: string) => column.toLowerCase().trim()),
        skip_empty_lines: true,
        trim: true,
    });

    const expectedPriceHeader = pricingFormat === "BASE" ? "base price" : "actual price";

    if (records.length > 0) {
        const firstRecord = records[0] as Record<string, string>;
        // Validation: Check if 'sku' exists
        if (!('sku' in firstRecord)) {
            throw new Error("CSV must contain 'sku' column.");
        }

        // Validation: Check for specific price column, fallback to generic 'price' only if strictly needed (but requirement says distinct names)
        // User Requirement: "In case of Base Price, price column name wil be Base Price... Actual price... Actual price"
        // So we strictly enforce these.
        if (!(expectedPriceHeader in firstRecord)) {
            throw new Error(`CSV must contain '${pricingFormat === "BASE" ? "Base Price" : "Actual Price"}' column.`);
        }
    }

    return records.map((record: any) => ({
        sku: record.sku,
        price: record[expectedPriceHeader],
    }));
}
