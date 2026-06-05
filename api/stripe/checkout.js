const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { domainName, price, buyerEmail, dealId } = req.body;

    if (!domainName || !price) {
      return res.status(400).json({ error: 'domainName and price required' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: buyerEmail || undefined,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Domain: ${domainName}`,
            description: `Full ownership transfer of ${domainName}. Auth code emailed within 24hrs.`,
          },
          unit_amount: Math.round(price * 100),
        },
        quantity: 1,
      }],
      metadata: { domain_name: domainName, deal_id: dealId || '', buyer_email: buyerEmail || '' },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || req.headers.origin}/checkout-success.html?domain=${encodeURIComponent(domainName)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL || req.headers.origin}`,
    });

    // Save to Supabase
    try {
      await supabase.from('deals').insert({
        domain_name: domainName, buyer_email: buyerEmail || null,
        asking_price: price, status: 'payment_pending',
        payment_method: 'stripe', stripe_session_id: session.id,
      });
    } catch (dbErr) {
      console.error('Supabase error:', dbErr);
    }

    return res.status(200).json({ url: session.url, sessionId: session.id });

  } catch (err) {
    console.error('[Stripe checkout]', err);
    return res.status(500).json({ error: err.message });
  }
};
