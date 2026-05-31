export function useLocaleDate() {
  const { locale } = useI18n();

  const formatDate = (value: string | number | Date | null | undefined) => {
    if (!value) return "";
    const date = new Date(value);
    if (isNaN(date.getTime()) || !isFinite(date.getTime())) return "";
    const localeTag = locale.value === "th" ? "th-u-ca-gregory" : locale.value;
    return new Intl.DateTimeFormat(localeTag, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  };

  return { formatDate };
}
