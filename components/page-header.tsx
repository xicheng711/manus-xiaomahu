import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export type PageTheme = {
  emoji: string;
  gradient: [string, string, string];
  title: string;
};

export const PAGE_THEMES: Record<string, PageTheme> = {
  checkin:    { emoji: '✨', gradient: ['#34D399', '#10B981', '#059669'], title: '每日打卡' },
  medication: { emoji: '💊', gradient: ['#FB7185', '#F43F5E', '#E11D48'], title: '用药管理' },
  diary:      { emoji: '📔', gradient: ['#38BDF8', '#0EA5E9', '#0284C7'], title: '护理日记' },
  family:     { emoji: '👥', gradient: ['#C084FC', '#A855F7', '#9333EA'], title: '家人共享' },
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
        {/* Left: icon + text */}
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
              {/* Accent bar */}
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

        {/* Right slot */}
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>

      {/* Bottom accent line */}
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
    shadowColor: '#000',
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
    color: '#9CA3AF',
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
