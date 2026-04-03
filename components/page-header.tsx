import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors, Gradients } from '@/lib/design-tokens';

export type PageTheme = {
  emoji: string;
  gradient: [string, string, string];
  title: string;
};

export const PAGE_THEMES: Record<string, PageTheme> = {
  checkin:    { emoji: '✅', gradient: [Gradients.green[0], Gradients.green[1], AppColors.green.strong], title: '每日打卡' },
  medication: { emoji: '💊', gradient: [Gradients.coral[0], Gradients.coral[1], AppColors.coral.primary], title: '用药管理' },
  diary:      { emoji: '📔', gradient: [Gradients.purple[0], Gradients.purple[1], AppColors.purple.strong], title: '护理日记' },
  family:     { emoji: '👥', gradient: [Gradients.navActive[0], Gradients.navActive[1], '#B8426A'], title: '家人共享' },
};

interface PageHeaderProps {
  theme: PageTheme;
  subtitle?: string;
  right?: React.ReactNode;
  style?: object;
}

export function PageHeader({ theme, subtitle, right, style }: PageHeaderProps) {
  const accentColor = theme.gradient[1];
  const lightBg = accentColor + '12';

  return (
    <View style={[styles.wrapper, style]}>
      <View style={styles.row}>
        <View style={styles.left}>
          <LinearGradient
            colors={theme.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Text style={styles.emoji}>{theme.emoji}</Text>
          </LinearGradient>

          <View style={styles.textBlock}>
            <View style={styles.titleRow}>
              <LinearGradient
                colors={theme.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.accentBar}
              />
              <Text style={[styles.title, { color: theme.gradient[2] }]}>
                {theme.title}
              </Text>
            </View>
            {subtitle ? (
              <Text style={styles.subtitle}>{subtitle}</Text>
            ) : null}
          </View>
        </View>

        {right ? <View style={styles.right}>{right}</View> : null}
      </View>

      <LinearGradient
        colors={[theme.gradient[0] + '60', theme.gradient[2] + '00']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.accentLine}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingTop: 10,
    marginBottom: 28,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AppColors.shadow.default,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  emoji: {
    fontSize: 22,
    lineHeight: 26,
  },
  textBlock: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  accentBar: {
    width: 3.5,
    height: 22,
    borderRadius: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: AppColors.text.tertiary,
    marginTop: 3,
    marginLeft: 11,
  },
  right: {
    marginLeft: 12,
  },
  accentLine: {
    height: 2,
    borderRadius: 1,
    width: '60%',
    marginLeft: 58,
  },
});
