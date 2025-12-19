import { type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { shop, payload, topic } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);
    console.log(`Payload: ${JSON.stringify(payload)}`);

    // Implement your redaction logic here
    // For this app, we don't store customer data in our DB related to offers,
    // so we just acknowledge it (return 200).

    return new Response();
};
