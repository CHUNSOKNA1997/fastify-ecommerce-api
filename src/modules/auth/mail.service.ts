import nodemailer from 'nodemailer'

function getMailConfig() {
  return {
    host: process.env.SMTP_HOST?.trim(),
    port: Number.parseInt(process.env.SMTP_PORT?.trim() || '587', 10),
    user: process.env.SMTP_USER?.trim(),
    pass: process.env.SMTP_PASS?.trim(),
    from: process.env.SMTP_FROM?.trim()
  }
}

function createTransporter() {
  const config = getMailConfig()
  if (!config.host || !config.user || !config.pass || !config.from) {
    return null
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass
    }
  })
}

export async function sendEmailVerificationOtp(email: string, otp: string, ttlMinutes: number): Promise<void> {
  const transporter = createTransporter()
  const config = getMailConfig()
  const isProduction = (process.env.NODE_ENV ?? 'development').toLowerCase() === 'production'

  if (!transporter || !config.from) {
    if (isProduction) {
      throw new Error('SMTP configuration is required in production')
    }

    return
  }

  await transporter.sendMail({
    from: config.from,
    to: email,
    subject: 'Verify your email',
    text: `Your verification code is ${otp}. It expires in ${ttlMinutes} minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Verify your email</h2>
        <p>Your verification code is:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${otp}</p>
        <p>This code expires in ${ttlMinutes} minutes.</p>
      </div>
    `
  })
}

export async function sendPasswordResetToken(email: string, resetToken: string, ttlMinutes: number): Promise<void> {
  const transporter = createTransporter()
  const config = getMailConfig()
  const isProduction = (process.env.NODE_ENV ?? 'development').toLowerCase() === 'production'

  if (!transporter || !config.from) {
    if (isProduction) {
      throw new Error('SMTP configuration is required in production')
    }

    return
  }

  await transporter.sendMail({
    from: config.from,
    to: email,
    subject: 'Reset your password',
    text: `Your password reset OTP is ${resetToken}. It expires in ${ttlMinutes} minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Reset your password</h2>
        <p>Use this OTP to reset your password:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${resetToken}</p>
        <p>This OTP expires in ${ttlMinutes} minutes.</p>
      </div>
    `
  })
}

export async function sendPaymentConfirmationEmail(input: {
  email: string
  customerName: string
  orderId: string
  transactionId: string
  amount: number
  currency: string
  items: Array<{
    name: string
    quantity: number
    unitPrice: number
  }>
}): Promise<void> {
  const transporter = createTransporter()
  const config = getMailConfig()
  const isProduction = (process.env.NODE_ENV ?? 'development').toLowerCase() === 'production'

  if (!transporter || !config.from) {
    if (isProduction) {
      throw new Error('SMTP configuration is required in production')
    }

    return
  }

  const itemLines = input.items
    .map((item) => `- ${item.name} x${item.quantity} (${input.currency} ${(item.unitPrice * item.quantity).toFixed(2)})`)
    .join('\n')
  const itemRows = input.items
    .map((item) => {
      const lineTotal = (item.unitPrice * item.quantity).toFixed(2)
      return `<tr>
        <td style="padding:8px 0;">${item.name}</td>
        <td style="padding:8px 0; text-align:center;">${item.quantity}</td>
        <td style="padding:8px 0; text-align:right;">${input.currency} ${lineTotal}</td>
      </tr>`
    })
    .join('')

  await transporter.sendMail({
    from: config.from,
    to: input.email,
    subject: `Payment confirmed for order ${input.orderId}`,
    text: `Hi ${input.customerName}, your payment has been confirmed.\n\nOrder ID: ${input.orderId}\nTransaction ID: ${input.transactionId}\nAmount: ${input.currency} ${input.amount.toFixed(2)}\n\nItems:\n${itemLines}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #122033;">
        <h2>Payment confirmed</h2>
        <p>Hi ${input.customerName}, your payment has been received successfully.</p>
        <p><strong>Order ID:</strong> ${input.orderId}<br />
        <strong>Transaction ID:</strong> ${input.transactionId}<br />
        <strong>Amount:</strong> ${input.currency} ${input.amount.toFixed(2)}</p>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th align="left" style="border-bottom:1px solid #d7e0ea; padding-bottom:8px;">Item</th>
              <th align="center" style="border-bottom:1px solid #d7e0ea; padding-bottom:8px;">Qty</th>
              <th align="right" style="border-bottom:1px solid #d7e0ea; padding-bottom:8px;">Total</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>
    `
  })
}
