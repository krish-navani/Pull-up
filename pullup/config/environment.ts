export const BACKEND_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  "https://pull-up-phi.vercel.app";

export const OTP_BACKEND_URL =
  process.env.EXPO_PUBLIC_OTP_BACKEND_URL ??
  BACKEND_URL;
