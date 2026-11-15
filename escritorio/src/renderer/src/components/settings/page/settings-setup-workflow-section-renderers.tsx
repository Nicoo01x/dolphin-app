import { useAppStore } from '@/store'
import { SessionHistorySettingsPane } from '../session-history/SessionHistorySettingsPane'
import { ArtifactsSettingsPane } from '../artifacts/ArtifactsSettingsPane'
import { AutomationsSettingsPane } from '../automations/AutomationsSettingsPane'
import { GeneralPane } from '../general/GeneralPane'
import { IntegrationsPane } from '../integrations/IntegrationsPane'
import { MobileSettingsPane } from '../mobile/MobileSettingsPane'
import { DolphinAccountSettingsPane } from '../accounts/dolphin/DolphinAccountSettingsPane'
import { SettingsSetupGuidePane } from '../setup-guide/SettingsSetupGuidePane'
import { ShareSkillsSettingsPane } from '../skills/sharing/ShareSkillsSettingsPane'
import { SettingsSection } from '../section-layout/SettingsSection'
import { translate } from '@/i18n/i18n'
import type { Translate } from '@/i18n/use-translate'
import type { SettingsRenderContext } from './settings-render-context'
import { DOLPHIN_USA_LA_NUBE_DE_DOLPHIN } from '../../../../../shared/dolphin-brand'

export function renderDolphinAccountSettingsSection(
  context: SettingsRenderContext,
  t: Translate = translate
): React.JSX.Element | null {
  const { model, navigation, view } = context
  // Why: la cuenta de DOLPHIN es un servicio de DOLPHIN, no de Dolphin (DOLPHIN_USA_LA_NUBE_DE_DOLPHIN).
  return model.showDesktopOnlySettings && DOLPHIN_USA_LA_NUBE_DE_DOLPHIN ? (
    <SettingsSection
      id="dolphin-account"
      title={t('auto.components.settings.dolphinAccount.title', 'Dolphin Account')}
      description={t(
        'auto.components.settings.dolphinAccount.description',
        'Share work instantly and reach your desktop from Dolphin Mobile wherever you are.'
      )}
      searchEntries={navigation.getSectionSearchEntries('dolphin-account')}
    >
      {view.isSectionMounted('dolphin-account') ? <DolphinAccountSettingsPane /> : null}
    </SettingsSection>
  ) : null
}

export function renderSetupGuideSettingsSection(
  context: SettingsRenderContext,
  t: Translate = translate
): React.JSX.Element {
  const { navigation, view } = context
  return (
    <SettingsSection
      id="setup-guide"
      title={t('auto.components.settings.Settings.6d119427ef', 'Onboarding checklist')}
      description={t(
        'auto.components.settings.Settings.6855b0f77d',
        'Finish the core workflows that make Dolphin useful for parallel agent work.'
      )}
      searchEntries={navigation.getSectionSearchEntries('setup-guide')}
      bodyClassName="overflow-hidden rounded-none border-0 bg-transparent p-0 shadow-none"
    >
      {view.isSectionMounted('setup-guide') ? <SettingsSetupGuidePane /> : null}
    </SettingsSection>
  )
}

export function renderGeneralSettingsSection(
  context: SettingsRenderContext,
  t: Translate = translate
): React.JSX.Element {
  const { model, interactions, navigation, terminal, view } = context
  return (
    <SettingsSection
      id="general"
      grouped
      hideHeader
      title={t('auto.components.settings.Settings.7807c11c4d', 'General')}
      description={t(
        'auto.components.settings.Settings.f9b77539fd',
        'Workspace defaults, app setup, and maintenance.'
      )}
      searchEntries={navigation.getSectionSearchEntries('general')}
    >
      {view.isSectionMounted('general') ? (
        <GeneralPane
          subPage={model.generalSubPage}
          onSelectSubPage={(page, sectionId) => {
            if (sectionId) {
              useAppStore
                .getState()
                .openSettingsTarget({ pane: 'general', repoId: null, sectionId })
              return
            }
            model.setGeneralSubPage(page)
            model.setHighlightedSettingsTarget(null)
            model.setSettingsSearchQuery('')
            interactions.contentScrollRef.current?.scrollTo({ top: 0 })
          }}
          settings={model.settings}
          updateSettings={model.updateSettings}
          updateSettingsOrThrow={model.updateSettingsOrThrow}
          fontSuggestions={model.terminalFontSuggestions}
          onRequestFontSuggestions={interactions.requestFontSuggestions}
          wslSupportedPlatform={terminal.localWslSupportedPlatform}
          wslAvailable={terminal.localWindowsRuntimeCapabilities.wslAvailable}
          wslDistros={terminal.localWindowsRuntimeCapabilities.wslDistros}
          wslCapabilitiesLoading={terminal.localWindowsRuntimeCapabilities.isLoading}
        />
      ) : null}
    </SettingsSection>
  )
}

export function renderIntegrationsSettingsSection(
  context: SettingsRenderContext,
  t: Translate = translate
): React.JSX.Element {
  const { navigation, view } = context
  return (
    <SettingsSection
      id="integrations"
      grouped
      title={t('auto.components.settings.Settings.c9ca101a3b', 'Integrations')}
      description={t(
        'auto.components.settings.Settings.b07041697f',
        'Connect GitHub, GitLab, Linear, and source-hosting services.'
      )}
      searchEntries={navigation.getSectionSearchEntries('integrations')}
      bodyClassName="rounded-none border-0 bg-transparent p-0 shadow-none"
    >
      {view.isSectionMounted('integrations') ? <IntegrationsPane /> : null}
    </SettingsSection>
  )
}

export function renderMobileSettingsSection(
  context: SettingsRenderContext,
  t: Translate = translate
): React.JSX.Element | null {
  const { model, navigation, view } = context
  // Why: DOLPHIN Mobile es la app de celular de DOLPHIN, no de Dolphin (DOLPHIN_USA_LA_NUBE_DE_DOLPHIN).
  return model.showDesktopOnlySettings && DOLPHIN_USA_LA_NUBE_DE_DOLPHIN ? (
    <SettingsSection
      id="mobile"
      grouped
      title={t('auto.components.settings.Settings.c40dadaac8', 'Mobile')}
      badge="Beta"
      description={t(
        'auto.components.settings.Settings.c6c01ac209',
        'Control terminals and agents from your phone.'
      )}
      searchEntries={navigation.getSectionSearchEntries('mobile')}
    >
      {view.isSectionMounted('mobile') ? <MobileSettingsPane /> : null}
    </SettingsSection>
  ) : null
}

export function renderAutomationsSettingsSection(
  context: SettingsRenderContext,
  t: Translate = translate
): React.JSX.Element {
  const { model, navigation, view } = context
  return (
    <SettingsSection
      id="automations"
      grouped
      title={t('auto.components.settings.automations.title', 'Automations')}
      description={t(
        'auto.components.settings.automations.description',
        'Schedule agent work and choose whether Automations appears in the sidebar.'
      )}
      searchEntries={navigation.getSectionSearchEntries('automations')}
    >
      {view.isSectionMounted('automations') ? (
        <AutomationsSettingsPane settings={model.settings} updateSettings={model.updateSettings} />
      ) : null}
    </SettingsSection>
  )
}

export function renderArtifactsSettingsSection(
  context: SettingsRenderContext,
  t: Translate = translate
): React.JSX.Element {
  const { model, navigation, view } = context
  return (
    <SettingsSection
      id="artifacts"
      grouped
      title={t('auto.components.settings.artifacts.title', 'Artifacts')}
      badge="Beta"
      description={t(
        'auto.components.settings.artifacts.description',
        'Share HTML and Markdown files with your team and manage their public links.'
      )}
      searchEntries={navigation.getSectionSearchEntries('artifacts')}
    >
      {view.isSectionMounted('artifacts') ? (
        <ArtifactsSettingsPane settings={model.settings} updateSettings={model.updateSettings} />
      ) : null}
    </SettingsSection>
  )
}

export function renderShareSkillsSettingsSection(
  context: SettingsRenderContext,
  t: Translate = translate
): React.JSX.Element {
  const { navigation, view } = context
  return (
    <SettingsSection
      id="share-skills"
      grouped
      title={t('auto.components.settings.shareSkills.ca754fefa1', 'Share skills')}
      badge="Beta"
      description={t(
        'auto.components.settings.shareSkills.description',
        'Share your skills with an unlisted link. Anyone who has it can install them.'
      )}
      searchEntries={navigation.getSectionSearchEntries('share-skills')}
    >
      {view.isSectionMounted('share-skills') ? <ShareSkillsSettingsPane /> : null}
    </SettingsSection>
  )
}

export function renderSessionHistorySettingsSection(
  context: SettingsRenderContext,
  t: Translate = translate
): React.JSX.Element {
  const { model, navigation, view } = context
  return (
    <SettingsSection
      id="session-history"
      grouped
      title={t('sessionHistory.settings.title', 'Agent Session Search')}
      description={t(
        'sessionHistory.settings.description',
        'Search everything your agents have said and done, on this computer and on any paired Dolphin server.'
      )}
      searchEntries={navigation.getSectionSearchEntries('session-history')}
    >
      {view.isSectionMounted('session-history') ? (
        <SessionHistorySettingsPane
          settings={model.settings}
          updateSettings={model.updateSettingsOrThrow}
        />
      ) : null}
    </SettingsSection>
  )
}
