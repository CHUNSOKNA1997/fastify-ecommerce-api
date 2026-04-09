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
