import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius, Shadows, Spacing } from '../../constants/theme';

type CardProps = {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
};

export function Card({ children, style, elevated = true }: CardProps) {
  return (
    <View style={[styles.card, elevated && Shadows.md, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
});
