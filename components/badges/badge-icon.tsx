import Svg, {
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

const SHAPE_PATH =
  'M255.59.65l-1-.65-1,.65C124.31,84.74,11.2,96.11,0,82.35c74.02,394.36,192.65,340.34,253.59,413.14l1,1.21,1-1.21c60.94-72.8,179.57-18.78,253.59-413.14-11.2,13.76-124.31,2.39-253.59-81.7Z';

const RIM_PATH =
  'M224.51,440.15c-58.01-22.61-100.94-73.26-126.94-128.78-26.88-56.28-41.4-117.45-52.64-178.15,0,0,91.05-5.07,91.05-5.07-5.55,83.33-8.32,171.76,32.1,247.32,13.83,25.16,33.06,47.37,56.43,64.69h0Z';

export type BadgeIconProps = {
  primaryColor: string;
  count?: number;
  countColor?: string;
  size?: number;
};

export function BadgeIcon({
  primaryColor,
  count,
  countColor = '#ffffff',
  size = 56,
}: BadgeIconProps) {
  const ratio = 496.7 / 509.18;
  const height = size * ratio;
  const label = count != null ? formatCount(count) : null;
  const fontSize = label && label.length >= 3 ? 180 : 220;

  return (
    <Svg width={size} height={height} viewBox="0 0 509.18 496.7">
      <Defs>
        <ClipPath id="badge-clip">
          <Path d={SHAPE_PATH} />
        </ClipPath>
        <LinearGradient
          id="badge-shade"
          x1="398.21"
          y1="398.66"
          x2="398.21"
          y2="111.42"
          gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#000" stopOpacity="0.25" />
        </LinearGradient>
        <RadialGradient
          id="badge-shine"
          cx="474.31"
          cy="261.81"
          rx="151.17"
          ry="151.17"
          gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#fff8d8" stopOpacity="0.85" />
          <Stop offset="0.5" stopColor="#fff8d8" stopOpacity="0.2" />
          <Stop offset="1" stopColor="#fff8d8" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      <G>
        <Path d={SHAPE_PATH} fill={primaryColor} />
        <G clipPath="url(#badge-clip)">
          <Rect x="254.59" y="-46.71" width="287.24" height="573.3" fill="url(#badge-shade)" />
          <Rect x="254.59" y="-46.71" width="287.24" height="573.3" fill="url(#badge-shine)" />
        </G>
      </G>

      <Path d={RIM_PATH} fill="#ffffff" fillOpacity={0.85} />

      {label ? (
        <SvgText
          x={254.59}
          y={250}
          fill={countColor}
          fontSize={fontSize}
          fontWeight="700"
          textAnchor="middle"
          alignmentBaseline="middle">
          {label}
        </SvgText>
      ) : null}
    </Svg>
  );
}

function formatCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return String(n);
}
