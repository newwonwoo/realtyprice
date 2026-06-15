import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const ENV_FILE = path.join(process.cwd(), ".env.local");

const KEY_MAP: Record<string, string> = {
  data_go_kr: "DATA_GO_KR_API_KEY",
  vworld: "VWORLD_API_KEY",
  telegram_bot_token: "TELEGRAM_BOT_TOKEN",
  telegram_chat_id: "TELEGRAM_CHAT_ID",
};

export async function GET() {
  const keys = {
    data_go_kr: !!process.env.DATA_GO_KR_API_KEY,
    vworld: !!process.env.VWORLD_API_KEY,
    telegram_bot_token: !!process.env.TELEGRAM_BOT_TOKEN,
    telegram_chat_id: !!process.env.TELEGRAM_CHAT_ID,
  };
  return NextResponse.json(keys);
}

export async function POST(req: NextRequest) {
  const { provider, value } = await req.json();
  const envKey = KEY_MAP[provider];
  if (!envKey)
    return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  const existing = fs.existsSync(ENV_FILE)
    ? fs.readFileSync(ENV_FILE, "utf-8")
    : "";
  const lines = existing.split("\n").filter((l) => !l.startsWith(`${envKey}=`));
  lines.push(`${envKey}=${value}`);
  fs.writeFileSync(ENV_FILE, lines.filter(Boolean).join("\n") + "\n");
  return NextResponse.json({ ok: true, note: "서버 재시작 후 적용됩니다." });
}

export async function DELETE(req: NextRequest) {
  const { provider } = await req.json();
  const envKey = KEY_MAP[provider];
  if (!envKey)
    return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  if (!fs.existsSync(ENV_FILE)) return NextResponse.json({ ok: true });
  const existing = fs.readFileSync(ENV_FILE, "utf-8");
  const lines = existing
    .split("\n")
    .filter((l) => !l.startsWith(`${envKey}=`));
  fs.writeFileSync(ENV_FILE, lines.filter(Boolean).join("\n") + "\n");
  return NextResponse.json({ ok: true });
}
