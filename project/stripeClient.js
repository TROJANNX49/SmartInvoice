/**
 * Stripe client — fetches credentials from the Replit Stripe connector.
 * Never cache the returned client; tokens can rotate.
 */
async function getStripeCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      'Missing Replit environment variables. ' +
        'Ensure the Stripe integration is connected via the Integrations tab.'
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: 'application/json', X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch Stripe credentials: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  const settings = data.items?.[0]?.settings;

  if (!settings?.secret_key) {
    throw new Error(
      'Stripe integration not connected or missing secret key. ' +
        'Connect Stripe via the Integrations tab first.'
    );
  }

  return {
    secretKey: settings.secret_key,
    publishableKey: settings.publishable_key ?? null,
  };
}

export async function getUncachableStripeClient() {
  const { secretKey } = await getStripeCredentials();
  const { default: Stripe } = await import('stripe');
  return new Stripe(secretKey, { apiVersion: '2025-05-28.basil' });
}
