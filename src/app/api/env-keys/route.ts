import { NextResponse } from "next/server";

const KEY_MAP: Record<string, string> = {
  data_go_kr: "DATA_GO_KR_API_KEY",
  vworld: "VWORLD_API_KEY",
  telegram_bot_token: "TELEGRAM_BOT_TOKEN",
  telegram_chat_id: "TELEGRAM_CHAT_ID",
  hug: "HUG_API_KEY",
};

// Vercel 환경변수에 각 키가 설정됐는지 여부만 반환 (값은 노출 안 함)
export async function GET() {
  const status: Record<string, boolean> = {};
  for (const [provider, envKey] of Object.entries(KEY_MAP)) {
    status[provider] = !!process.env[envKey];
  }
  return NextResponse.json(status);
}
