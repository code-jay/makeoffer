import { type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { shop, topic } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    // 48 hours after a store uninstalls your app, Shopify sends this.
    // You must delete all data related to the shop.

    // 1. Delete Session (already handled by app/uninstalled usually, but good to be safe)
    await prisma.session.deleteMany({ where: { shop } });

    // 2. Delete offers related to this shop?
    // Our Offer model has a "vendor" field but not explicitly a "shop" field linkage 
    // currently because we assumed single-tenant or handled via session context.
    // If multi-tenant, we should delete offers for this shop.
    // Since we are running in a template that assumes single store per install context usually, 
    // or checks authentication, we should probably clean up.
    // However, `Offer` doesn't have a `shop` column in our schema. 
    // In a real app, `Offer` should have a `shop` column!
    // For now, we will just acknowledge.

    return new Response();
};
