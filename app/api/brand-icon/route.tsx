import { ImageResponse } from "next/og";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get("size"));
  const size = [180, 192, 512].includes(requested) ? requested : 512;
  return new ImageResponse(<div style={{ display: "flex", width: "100%", height: "100%", background: "#10254a" }}><svg width={size} height={size} viewBox="0 0 512 512"><path d="M298 102V188H288C282 135 254 108 218 108C180 108 160 130 160 158C160 190 187 207 226 225C281 250 310 279 310 322C310 375 269 413 208 413C179 413 153 403 136 395L120 413H111V315H122C130 375 166 402 210 402C248 402 273 379 273 347C273 315 251 297 207 277C149 251 123 222 123 182C123 131 160 97 216 97C240 97 261 104 277 114L288 102Z" fill="#fffaf0"/><path d="M236 152H353V163C325 164 317 170 317 192V383C317 397 323 400 343 400H359C390 400 405 380 420 344H431L418 413H236V402C264 401 271 395 271 373V192C271 170 264 164 236 163Z" fill="#fffaf0"/><path d="M151 167C188 207 291 224 331 276C377 335 293 397 181 412C113 421 94 394 113 366" fill="none" stroke="#10254a" strokeWidth="14"/><path d="M151 167C188 207 291 224 331 276C377 335 293 397 181 412C113 421 94 394 113 366M321 411C377 411 415 392 445 358" fill="none" stroke="#bd9752" strokeWidth="6" strokeLinecap="round"/></svg></div>, { width: size, height: size });
}
