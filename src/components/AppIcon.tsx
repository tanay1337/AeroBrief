import React from 'react';
import Svg, { Circle, G, Line, Polygon, Rect } from 'react-native-svg';

export function AppIcon({ size = 76 }: { size?: number }): React.JSX.Element {
  return <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="AeroBrief app icon">
    <Rect width="1024" height="1024" rx="220" fill="#14727B" />
    <Circle cx="512" cy="520" r="306" fill="none" stroke="#FFFFFF" strokeWidth="34" />
    <Line x1="512" y1="190" x2="512" y2="226" stroke="#FFFFFF" strokeWidth="32" strokeLinecap="round" />
    <Line x1="512" y1="814" x2="512" y2="866" stroke="#FFFFFF" strokeWidth="32" strokeLinecap="round" />
    <Line x1="164" y1="520" x2="216" y2="520" stroke="#FFFFFF" strokeWidth="32" strokeLinecap="round" />
    <Line x1="808" y1="520" x2="860" y2="520" stroke="#FFFFFF" strokeWidth="32" strokeLinecap="round" />
    <Polygon points="512,104 458,190 566,190" fill="#FFC548" />
    <G rotation="45" origin="512,520">
      <Rect x="418" y="282" width="188" height="476" rx="20" fill="#FFFFFF" />
      <Line x1="512" y1="330" x2="512" y2="395" stroke="#14727B" strokeWidth="24" strokeLinecap="round" />
      <Line x1="512" y1="438" x2="512" y2="503" stroke="#14727B" strokeWidth="24" strokeLinecap="round" />
      <Line x1="512" y1="546" x2="512" y2="611" stroke="#14727B" strokeWidth="24" strokeLinecap="round" />
      <Line x1="512" y1="654" x2="512" y2="710" stroke="#14727B" strokeWidth="24" strokeLinecap="round" />
    </G>
  </Svg>;
}
