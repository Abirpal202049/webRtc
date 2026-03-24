/**
 * Sparkline — Lightweight SVG sparkline chart.
 *
 * No charting library needed. Renders a simple polyline from
 * an array of numbers. Uses Tailwind color classes via currentColor.
 */
export default function Sparkline({
  data = [],
  width = 120,
  height = 28,
  color = "text-cyan-400",
  max: maxProp,
}) {
  if (data.length < 2) return <div style={{ width, height }} />;

  const max = maxProp ?? Math.max(...data, 1);
  const min = 0;
  const range = max - min || 1;

  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  // Area fill polygon: same points but closed along the bottom
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg
      width={width}
      height={height}
      className={`${color} shrink-0`}
      viewBox={`0 0 ${width} ${height}`}
    >
      <polygon
        points={areaPoints}
        fill="currentColor"
        opacity="0.1"
      />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
