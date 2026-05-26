import { NextResponse } from "next/server";
import { getFeed } from "../../../../lib/incidents";
export function GET() { return NextResponse.json(getFeed()); }
