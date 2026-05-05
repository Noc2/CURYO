import React from "react";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { type ContentShareData, VOTE_SHARE_RATING_VERSION_PARAM } from "~~/lib/social/contentShare";
import { getContentShareDataForParam } from "~~/lib/social/contentShare.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const imageSize = {
  width: 1200,
  height: 630,
};

const versionedResponseHeaders = {
  "Cache-Control": "public, max-age=86400, immutable",
  "CDN-Cache-Control": "public, max-age=86400, stale-while-revalidate=604800, stale-if-error=604800",
  "Vercel-CDN-Cache-Control": "public, max-age=86400, stale-while-revalidate=604800, stale-if-error=604800",
};

const fallbackResponseHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

function Metric({ label, value, valueFontSize = 38 }: { label: string; value: string; valueFontSize?: number }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "16px 18px",
        border: "1px solid #2b332c",
        borderRadius: 8,
        background: "#161a16",
        minWidth: 170,
      }}
    >
      <div style={{ color: "#a7b3a8", fontSize: 22, fontWeight: 600 }}>{label}</div>
      <div style={{ color: "#f7fff5", fontSize: valueFontSize, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

function RatingShareImage({ shareData }: { shareData: ContentShareData }) {
  const openRoundLabel =
    shareData.openRoundVoteCount > 0
      ? `${shareData.openRoundVoteCount} hidden vote${shareData.openRoundVoteCount === 1 ? "" : "s"} in the open round`
      : "Open round ready for your vote";

  const ratingMetrics = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Metric label="Total votes" value={shareData.totalVotes.toLocaleString("en-US")} />
      <Metric label="Open round" value={openRoundLabel} valueFontSize={24} />
    </div>
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#10130f",
        color: "#f7fff5",
        padding: 56,
        fontFamily: "Arial",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 8,
              background: "#50f29a",
              border: "2px solid #f7fff5",
            }}
          />
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 0 }}>Curyo</div>
        </div>
        <div
          style={{
            color: "#10130f",
            background: "#f7fff5",
            borderRadius: 8,
            padding: "10px 18px",
            fontSize: 24,
            fontWeight: 800,
          }}
        >
          Disagree? Vote.
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, gap: 44, alignItems: "center", paddingTop: 46 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ color: "#50f29a", fontSize: 28, fontWeight: 800, marginBottom: 18 }}>Current Curyo rating</div>
          <div
            style={{
              fontSize: 68,
              fontWeight: 900,
              lineHeight: 1.04,
              color: "#f7fff5",
              marginBottom: 24,
            }}
          >
            {shareData.contentTitle}
          </div>
          <div
            style={{
              display: "flex",
              color: "#cbd7ca",
              fontSize: 28,
              lineHeight: 1.28,
              maxWidth: 700,
            }}
          >
            {shareData.contentDescription || "Stake HREP, vote with conviction, and move the rating."}
          </div>
        </div>

        {shareData.contentImageUrl ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 360,
              borderRadius: 8,
              border: "2px solid #50f29a",
              background: "#f7fff5",
              color: "#10130f",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                position: "relative",
                width: "100%",
                height: 244,
                background: "#161a16",
              }}
            >
              <img
                src={shareData.contentImageUrl}
                alt=""
                width={360}
                height={244}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  right: 18,
                  bottom: 18,
                  width: 150,
                  height: 150,
                  borderRadius: 999,
                  border: "3px solid #50f29a",
                  background: "#f7fff5",
                  color: "#10130f",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 16px 42px rgba(0,0,0,0.34)",
                }}
              >
                <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 0.86 }}>{shareData.rating.label}</div>
                <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.1 }}>/10</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 22 }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#10130f" }}>Current rating</div>
              {ratingMetrics}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 330,
              borderRadius: 8,
              border: "2px solid #50f29a",
              background: "#f7fff5",
              color: "#10130f",
              padding: 28,
              gap: 20,
            }}
          >
            <div style={{ fontSize: 26, fontWeight: 900, color: "#10130f" }}>Current rating</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
              <div style={{ fontSize: 104, fontWeight: 900, lineHeight: 0.9 }}>{shareData.rating.label}</div>
              <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 1.1, paddingBottom: 8 }}>/10</div>
            </div>
            {ratingMetrics}
          </div>
        )}
      </div>
    </div>
  );
}

function FallbackShareImage() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        background: "#10130f",
        color: "#f7fff5",
        padding: 64,
        fontFamily: "Arial",
      }}
    >
      <div style={{ color: "#50f29a", fontSize: 34, fontWeight: 800, marginBottom: 18 }}>Curyo</div>
      <div style={{ fontSize: 86, fontWeight: 900, lineHeight: 1.02, maxWidth: 880 }}>Human reputation at stake</div>
      <div style={{ color: "#cbd7ca", fontSize: 34, marginTop: 28 }}>Get verified, stake HREP, and rate content.</div>
    </div>
  );
}

export async function GET(request: NextRequest) {
  const shareData = await getContentShareDataForParam(request.nextUrl.searchParams.get("content"), {
    origin: request.nextUrl.origin,
  });
  const requestedRatingVersion = request.nextUrl.searchParams.get(VOTE_SHARE_RATING_VERSION_PARAM);
  const hasCurrentRatingVersion = Boolean(shareData && requestedRatingVersion === shareData.ratingVersion);

  return new ImageResponse(shareData ? <RatingShareImage shareData={shareData} /> : <FallbackShareImage />, {
    ...imageSize,
    headers: hasCurrentRatingVersion ? versionedResponseHeaders : fallbackResponseHeaders,
  });
}
