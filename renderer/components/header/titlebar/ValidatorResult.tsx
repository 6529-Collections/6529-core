// Copyright 2026 The 6529validator Authors
// SPDX-License-Identifier: Apache-2.0
// Adapted from crates/node-ui/assets/picture.js in Validator rc.14 for React
// and the Desktop popover. See assets/validator-result-LICENSE.txt.
const ADJECTIVES =
  "Quiet Bright Slow Hidden Golden Silver Velvet Paper Copper Wild Gentle Northern Southern Open Patient Distant Early Late Lucky Honest Tidal Woven Painted Steady Clear Folded Sunlit Moonlit Salt Cedar Indigo Coral".split(
    " "
  );
const NOUNS =
  "Lantern Harbor Orchard Meadow Comet Anchor Ledger Compass Willow Lighthouse River Garden Atlas Beacon Canyon Delta Ember Feather Glacier Hollow Island Juniper Kestrel Lagoon Mosaic Nebula Oasis Pebble Quarry Ridge Summit Thistle Valley Window Archive Bridge Cathedral Dune Echo Fjord Grove Horizon Inlet Journal Kite Loom Mill Nest Obelisk Prism Quilt Reef Sail Tower Umbra Vessel Wharf Yarrow Zephyr Signal Spiral Fresco Tapestry Marble".split(
    " "
  );

export default function ValidatorResult({ root }: { readonly root: string }) {
  const digits = root.slice(2);
  const bytes = Array.from({ length: 32 }, (_, index) =>
    Number.parseInt(digits.slice(index * 2, index * 2 + 2), 16)
  );
  const first = bytes[0] ?? 0;
  const second = bytes[1] ?? 0;
  const name = `${ADJECTIVES[first % 32]} ${NOUNS[second % 64]}`;
  const baseHue = (300 + (first / 255) * 290) % 360;
  const opposite = (baseHue + 150) % 360;
  const innerHue =
    opposite >= 225 && opposite <= 305 ? (opposite + 95) % 360 : opposite;

  return (
    <span className="tw-flex tw-items-center tw-gap-2 tw-font-semibold">
      <svg
        aria-hidden="true"
        className="tw-size-8 tw-shrink-0"
        viewBox="-16 -16 32 32"
      >
        <circle r={16} fill="#1c1c21" />
        <circle r={16} fill={`oklch(60% 0.05 ${baseHue})`} opacity={0.1} />
        {Array.from(digits, (digit, index) => {
          const value = Number.parseInt(digit, 16);
          const hue = (baseHue + (value / 15 - 0.5) * 24 + 360) % 360;
          return (
            <line
              key={index}
              x1={8.32}
              x2={16 * (0.6 + (0.26 * value) / 15)}
              y1={0}
              y2={0}
              transform={`rotate(${(index * 360) / 64 - 90})`}
              stroke={`oklch(${70 + value * 0.5}% 0.085 ${hue})`}
              strokeWidth={1}
              strokeLinecap="round"
              opacity={0.92}
            />
          );
        })}
        {bytes.map((value, index) => (
          <line
            key={index}
            x1={3.2}
            x2={16 * (0.27 + (0.16 * value) / 255)}
            y1={0}
            y2={0}
            transform={`rotate(${((index + 0.5) * 360) / 32 - 90})`}
            stroke={`oklch(82% 0.06 ${(innerHue + (value / 255 - 0.5) * 20) % 360})`}
            strokeWidth={1}
            strokeLinecap="round"
            opacity={0.9}
          />
        ))}
        <circle r={1.92} fill={`oklch(84% 0.06 ${innerHue})`} opacity={0.92} />
        <circle
          r={15.52}
          fill="none"
          stroke={`oklch(72% 0.08 ${baseHue})`}
          strokeWidth={0.8}
          opacity={0.3}
        />
      </svg>
      {name}
    </span>
  );
}
