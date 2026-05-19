export function useEditorNavigation(siteId: string) {
  const { editorBackPath } = useDashboardSiteLinks(siteId)
  const router = useRouter()

  const handleBack = () => {
    router.push(editorBackPath.value)
  }

  return {
    editorBackPath,
    handleBack
  }
}
