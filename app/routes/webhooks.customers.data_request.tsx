import { type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { shop, payload, topic } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    // Payload contains customer info requested
    // We must return the data we hold on this customer.
    // Since we don't hold any, we return empty/acknowledge.

    return new Response();
};
