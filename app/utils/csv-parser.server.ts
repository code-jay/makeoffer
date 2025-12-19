import { parse } from 'csv-parse/sync';

export interface CSVRow {
    sku: string;
    price: string;
}

export function parseCSV(content: string): CSVRow[] {
    const records = parse(content, {
        columns: (header) => header.map((column: string) => column.toLowerCase().trim()),
        skip_empty_lines: true,
        trim: true,
    });

    // Basic validation to ensure required columns exist
    if (records.length > 0) {
        if (!('sku' in records[0]) || !('price' in records[0])) {
            // Fallback or error if headers are missing/different? 
            // For now assuming the user provides SKU and Price headers.
            throw new Error("CSV must contain 'sku' and 'price' columns.");
        }
    }

    return records.map((record: any) => ({
        sku: record.sku,
        price: record.price,
    }));
}
