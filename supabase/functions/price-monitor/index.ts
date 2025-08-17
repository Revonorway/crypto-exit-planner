import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PriceAlert {
  id: string
  user_id: string
  asset_id: string
  asset_name: string
  symbol: string
  target_price: number
  direction: 'above' | 'below'
  percentage_to_sell: number
  current_price: number
  user_email: string
  is_active: boolean
  is_triggered: boolean
  email_sent: boolean
}

interface CoinGeckoPriceResponse {
  [key: string]: {
    usd: number
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🔍 Price Monitor function started')
    
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get all active price alerts that haven't been triggered
    const { data: alerts, error: alertsError } = await supabaseClient
      .from('price_alerts')
      .select('*')
      .eq('is_active', true)
      .eq('is_triggered', false)
      .eq('alert_type', 'exit_level')

    if (alertsError) {
      console.error('❌ Error fetching alerts:', alertsError)
      throw alertsError
    }

    if (!alerts || alerts.length === 0) {
      console.log('ℹ️ No active alerts to process')
      return new Response(
        JSON.stringify({ message: 'No active alerts to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`📊 Found ${alerts.length} active alerts to check`)

    // Get unique asset IDs for price fetching
    const assetIds = [...new Set(alerts.map(alert => alert.asset_id))]
    console.log('🪙 Assets to check:', assetIds)

    // Fetch current prices from CoinGecko
    const priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${assetIds.join(',')}&vs_currencies=usd`
    
    const priceResponse = await fetch(priceUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Crypto-Exit-Planner/1.0'
      }
    })

    if (!priceResponse.ok) {
      throw new Error(`CoinGecko API error: ${priceResponse.status}`)
    }

    const priceData: CoinGeckoPriceResponse = await priceResponse.json()
    console.log('💰 Current prices fetched:', priceData)

    const triggeredAlerts: PriceAlert[] = []

    // Check each alert against current prices
    for (const alert of alerts as PriceAlert[]) {
      const currentPrice = priceData[alert.asset_id]?.usd

      if (!currentPrice) {
        console.warn(`⚠️ No price data for ${alert.asset_id}`)
        continue
      }

      console.log(`🔍 Checking ${alert.symbol}: target ${alert.target_price} ${alert.direction} current ${currentPrice}`)

      let isTriggered = false

      if (alert.direction === 'above' && currentPrice >= alert.target_price) {
        isTriggered = true
      } else if (alert.direction === 'below' && currentPrice <= alert.target_price) {
        isTriggered = true
      }

      if (isTriggered) {
        console.log(`🚨 ALERT TRIGGERED: ${alert.symbol} reached ${alert.target_price}!`)
        
        // Update alert as triggered
        const { error: updateError } = await supabaseClient
          .from('price_alerts')
          .update({
            is_triggered: true,
            triggered_at: new Date().toISOString(),
            current_price: currentPrice
          })
          .eq('id', alert.id)

        if (updateError) {
          console.error('❌ Error updating alert:', updateError)
          continue
        }

        triggeredAlerts.push({
          ...alert,
          current_price: currentPrice
        })
      }
    }

    console.log(`📧 ${triggeredAlerts.length} alerts triggered, sending emails...`)

    // Send emails for triggered alerts
    let emailsSent = 0
    for (const alert of triggeredAlerts) {
      try {
        await sendPriceAlertEmail(alert)
        
        // Mark email as sent
        await supabaseClient
          .from('price_alerts')
          .update({
            email_sent: true,
            email_sent_at: new Date().toISOString()
          })
          .eq('id', alert.id)

        emailsSent++
        console.log(`✅ Email sent for ${alert.symbol} alert`)
      } catch (emailError) {
        console.error(`❌ Failed to send email for ${alert.symbol}:`, emailError)
      }
    }

    const result = {
      message: 'Price monitoring completed',
      alerts_checked: alerts.length,
      alerts_triggered: triggeredAlerts.length,
      emails_sent: emailsSent,
      triggered_assets: triggeredAlerts.map(a => ({
        symbol: a.symbol,
        target_price: a.target_price,
        current_price: a.current_price,
        percentage_to_sell: a.percentage_to_sell
      }))
    }

    console.log('✅ Price monitoring completed:', result)

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Price monitor error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

async function sendPriceAlertEmail(alert: PriceAlert) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY environment variable not set')
  }

  // Format the percentage and amounts
  const percentageText = alert.percentage_to_sell ? `${alert.percentage_to_sell}%` : 'some'
  const priceDirection = alert.direction === 'above' ? 'above' : 'below'
  const currentPriceFormatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 8
  }).format(alert.current_price)
  
  const targetPriceFormatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 8
  }).format(alert.target_price)

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>🎯 Price Alert: ${alert.symbol} Target Reached!</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
        .content { padding: 30px 20px; }
        .alert-card { background: #f8fafc; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .price-info { display: flex; justify-content: space-between; margin: 15px 0; }
        .price-label { font-weight: 600; color: #374151; }
        .price-value { font-weight: 700; color: #10b981; }
        .target-reached { background: #ecfdf5; border: 2px solid #10b981; color: #065f46; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; font-weight: 600; }
        .action-section { background: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .cta-button { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 10px 0; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎯 Price Alert Triggered!</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Your ${alert.symbol} exit level has been reached</p>
        </div>
        
        <div class="content">
          <div class="target-reached">
            🚨 <strong>${alert.asset_name} (${alert.symbol})</strong> has reached your target price!
          </div>
          
          <div class="alert-card">
            <h3 style="margin-top: 0; color: #1f2937;">📊 Price Details</h3>
            <div class="price-info">
              <span class="price-label">Target Price:</span>
              <span class="price-value">${targetPriceFormatted}</span>
            </div>
            <div class="price-info">
              <span class="price-label">Current Price:</span>
              <span class="price-value">${currentPriceFormatted}</span>
            </div>
            <div class="price-info">
              <span class="price-label">Direction:</span>
              <span class="price-value">${priceDirection.toUpperCase()}</span>
            </div>
          </div>
          
          <div class="action-section">
            <h3 style="margin-top: 0; color: #92400e;">💰 Planned Exit Strategy</h3>
            <p style="margin-bottom: 0;">According to your exit strategy, you planned to sell <strong>${percentageText} of your ${alert.symbol} holdings</strong> when the price reached ${targetPriceFormatted}.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://crypto-exit-planner.vercel.app/strategy.html?asset=${alert.asset_id}" class="cta-button">
              📈 View Strategy Page
            </a>
          </div>
          
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #6b7280; font-size: 14px;">
              <strong>💡 Next Steps:</strong><br>
              • Review your portfolio on the strategy page<br>
              • Consider market conditions before executing trades<br>
              • Remember that this is not financial advice<br>
              • Update your exit strategy as needed
            </p>
          </div>
        </div>
        
        <div class="footer">
          <p>This alert was sent from your Crypto Exit Planner dashboard.</p>
          <p style="margin: 5px 0;">You can manage your alerts and preferences in your profile settings.</p>
        </div>
      </div>
    </body>
    </html>
  `

  const emailRequest = {
    from: 'Crypto Exit Planner <alerts@crypto-exit-planner.com>',
    to: [alert.user_email],
    subject: `🎯 ${alert.symbol} Alert: Target ${targetPriceFormatted} Reached!`,
    html: emailHtml
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(emailRequest)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Resend API error: ${response.status} - ${errorText}`)
  }

  const result = await response.json()
  console.log('📧 Email sent successfully:', result)
  return result
}
