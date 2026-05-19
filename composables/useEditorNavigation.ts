export function useEditorNavigation(siteId: string) {
  const { editorBackPath } = useDashboardSiteLinks(siteId)

  const handleBack = () => {
    const router = useRouter()
    router.push(editorBackPath.value)
  }

  return {
    editorBackPath,
    handleBack
  }
}
