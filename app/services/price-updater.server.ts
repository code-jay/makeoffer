import prisma from "../db.server";

export async function applyOfferPrices(admin: any, offerId: number) {
    const offer = await prisma.offer.findUnique({
        where: { id: offerId },
        include: { items: true },
    });

    if (!offer || offer.status !== "PENDING") {
        console.log(`Offer ${offerId} not found or not PENDING`);
        return;
    }

    // Parse tags to array
    const offerTags = offer.tags.split(',').map(t => t.trim()).filter(Boolean);

    for (const item of offer.items) {
        const query = `
      query {
        productVariants(first: 1, query: "sku:${item.sku}") {
          edges {
            node {
              id
              price
              product {
                id
                tags
              }
            }
          }
        }
      }
    `;

        const response = await admin.graphql(query);
        const data = await response.json();
        const variant = data.data.productVariants.edges[0]?.node;

        if (variant) {
            // Store original price based on Offer Type
            // If REGULAR, we want to simulate a permanent change.
            // The user requested: "Offer Price will also be same as Original/Current Price".
            // So we set originalPrice to the NEW offerPrice, so that 'revert' (if it happens)
            // keeps the price as is (or effectively disables revert to old price).
            // If OFFER, we store the actual old variant.price so we can revert to it.
            let priceToStore = parseFloat(variant.price);
            if (offer.priceType === "REGULAR") {
                priceToStore = item.offerPrice.toNumber(); // Assuming offerPrice is Decimal
            }

            await prisma.offerItem.update({
                where: { id: item.id },
                data: { originalPrice: priceToStore },
            });

            // Update Price
            const mutationPrice = `
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants {
              id
              price
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

            const updateResponse = await admin.graphql(mutationPrice, {
                variables: {
                    productId: variant.product.id,
                    variants: [{
                        id: variant.id,
                        price: item.offerPrice.toString(),
                    }],
                },
            });

            const updateData = await updateResponse.json();
            if (updateData.data.productVariantsBulkUpdate.userErrors.length > 0) {
                console.error("Error updating variant", updateData.data.productVariantsBulkUpdate.userErrors);
            }

            // Update Tags (Append)
            if (offerTags.length > 0) {
                const currentTags = variant.product.tags;
                const newTags = [...new Set([...currentTags, ...offerTags])];

                const mutationTags = `
            mutation productUpdate($input: ProductInput!) {
                productUpdate(input: $input) {
                    product {
                        id
                        tags
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
          `;

                await admin.graphql(mutationTags, {
                    variables: {
                        input: {
                            id: variant.product.id,
                            tags: newTags
                        }
                    }
                });
            }

        } else {
            console.warn(`Variant not found for SKU: ${item.sku}`);
        }
    }

    await prisma.offer.update({
        where: { id: offerId },
        data: { status: "ACTIVE" },
    });
}

export async function revertOfferPrices(admin: any, offerId: number) {
    const offer = await prisma.offer.findUnique({
        where: { id: offerId },
        include: { items: true },
    });

    if (!offer || offer.status !== "ACTIVE") {
        console.log(`Offer ${offerId} not found or not ACTIVE`);
        return;
    }

    // Parse tags to remove
    const offerTags = offer.tags.split(',').map(t => t.trim()).filter(Boolean);

    for (const item of offer.items) {
        if (item.originalPrice !== null) {
            const query = `
        query {
            productVariants(first: 1, query: "sku:${item.sku}") {
            edges {
                node {
                id
                product {
                    id
                    tags
                }
                }
            }
            }
        }
        `;

            const response = await admin.graphql(query);
            const data = await response.json();
            const variant = data.data.productVariants.edges[0]?.node;

            if (variant) {
                const mutationPrice = `
                mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
                    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
                        userErrors {
                            field
                            message
                        }
                    }
                }
            `;

                await admin.graphql(mutationPrice, {
                    variables: {
                        productId: variant.product.id,
                        variants: [{
                            id: variant.id,
                            price: item.originalPrice?.toString(),
                        }],
                    },
                });

                // Revert Tags (Remove)
                if (offerTags.length > 0) {
                    const currentTags = variant.product.tags; // Array of strings
                    const newTags = currentTags.filter((t: string) => !offerTags.includes(t));

                    const mutationTags = `
                    mutation productUpdate($input: ProductInput!) {
                        productUpdate(input: $input) {
                            product {
                                id
                                tags
                            }
                            userErrors {
                                field
                                message
                            }
                        }
                    }
                `;

                    await admin.graphql(mutationTags, {
                        variables: {
                            input: {
                                id: variant.product.id,
                                tags: newTags
                            }
                        }
                    });
                }
            }
        }
    }

    await prisma.offer.update({
        where: { id: offerId },
        data: { status: "COMPLETED" },
    });
}
