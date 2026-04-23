import { derivePalette } from '@/lib/theme/colors';
import { getFont, type FontId } from '@/lib/theme/fonts';
import { usePreferences } from '@/store/preferences';
import { useMemo } from 'react';
import { View, type ViewProps } from 'react-native';
import { vars } from 'nativewind';

type Props = ViewProps & {
  children: React.ReactNode;
};

function buildVars(primary: string, secondary: string, bg: string, fontId: FontId) {
  const palette = derivePalette(primary, secondary, bg);
  const font = getFont(fontId);
  return vars({
    ...palette,
    '--font-sans': font.variants.sans,
    '--font-sans-med': font.variants.sansMed,
    '--font-sans-semi': font.variants.sansSemi,
    '--font-sans-bold': font.variants.sansBold,
    '--font-display': font.variants.display,
  });
}

export function ThemeProvider({ children, style, ...rest }: Props) {
  const primary = usePreferences((s) => s.colorPrimary);
  const secondary = usePreferences((s) => s.colorSecondary);
  const bg = usePreferences((s) => s.colorBg);
  const fontId = usePreferences((s) => s.fontId);

  const themeStyle = useMemo(
    () => buildVars(primary, secondary, bg, fontId),
    [primary, secondary, bg, fontId],
  );

  return (
    <View {...rest} style={[{ flex: 1 }, themeStyle, style]}>
      {children}
    </View>
  );
}
