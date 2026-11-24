import { text } from '@/theme';

type Props = {
  message: string | null;
  variant?: 'error' | 'warning' | 'success';
};

const variantClass: Record<NonNullable<Props['variant']>, string> = {
  error: 'banner-error',
  warning: 'banner-warning',
  success: 'banner-success',
};

export function FeedbackBanner({ message, variant = 'error' }: Props) {
  if (!message) return null;
  return (
    <p className={variantClass[variant]} role="alert" style={text.footnote}>
      {message}
    </p>
  );
}
