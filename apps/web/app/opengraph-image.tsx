import { ImageResponse } from "next/og";

export const alt = "Postdrop — share web-renderable artifacts from your agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#17172d",
          color: "#ffffff",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 88,
              height: 88,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 24,
              backgroundColor: "#635bff",
              fontSize: 44,
              fontWeight: 700,
            }}
          >
            pd
          </div>
          <div style={{ fontSize: 64, fontWeight: 600, letterSpacing: -2 }}>postdrop</div>
        </div>
        <div style={{ fontSize: 44, color: "#c9c9e8", textAlign: "center", maxWidth: 900 }}>
          Your agent makes files. Postdrop makes them shareable.
        </div>
      </div>
    ),
    size
  );
}
