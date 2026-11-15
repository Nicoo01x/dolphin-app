import type {
  ComposerModel,
  QuickCreationExecutionInput as SharedQuickCreationExecutionInput
} from './composer-model'

// Dolphin: el primer turno del agente sale del campo de prompt (ver firstTurnText).
type QuickCreationExecutionInput = SharedQuickCreationExecutionInput &
  Pick<ComposerModel, 'agentPrompt'>

import { resolveQuickCreateLinkedWorkItemPrompt } from '@/lib/work-items/linked-work-item-context'
import { useCallback } from 'react'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import type { WorktreeCreationRequest } from '@/lib/workspace/creation/pending-worktree-creation'
import { useAppStore } from '@/store'
import { isWorkspaceStatusAllowedOnHost } from '@/store/workspaces/status/host-workspace-status-columns'
import { settleComposerSubmit } from '@/lib/workspace/creation/composer-submit-cancellation'
import { runBackgroundWorktreeCreation } from '@/lib/workspace/creation/worktree-creation-flow'
import type { ComposerCreateHandoff } from '@/lib/workspace/creation/composer-create-handoff'
import { translate } from '@/i18n/i18n'
import { prepareQuickComposerStartup } from './quick-startup-plan'
import { buildQuickCreationRequest, type QuickSubmitOptions } from './quick-creation-request'
import type { PendingSmartGitHubSubmitResolution } from './source-selection-decisions'
import { resolveAgentSessionLaunchRoute } from '@/lib/agent-session/launch/routing/agent-session-launch-plan'

export function useQuickCreationExecution(input: QuickCreationExecutionInput) {
  const {
    agentPrompt,
    clearNewWorkspaceDraft,
    createMultiple,
    effectivePresetId,
    ephemeralVmRecipes,
    ephemeralVmsEnabled,
    isSubmissionCancelled,
    linkedGitLabIssue,
    linkedGitLabMR,
    normalizedSparseDirectories,
    onCreated,
    parentWorktreeId,
    persistDraft,
    persistSetupAgentStartupPolicy,
    prepareQuickSubmit,
    resetForNextCreate,
    resolvedInitialWorkspaceStatus,
    selectedEphemeralVmRecipeId,
    selectedRepoAgentLaunchFact,
    selectedRepoExecutionHostId,
    selectedRepoIsGit,
    selectedRepoIsRemote,
    selectedRepoTarget,
    selectedRepoStartupShell,
    selectedWorkspaceTarget,
    settings,
    sparseEnabled,
    taskSourceContext,
    telemetrySource
  } = input

  const executeQuickCreation = useCallback(
    async (
      smartGitHubResolution: PendingSmartGitHubSubmitResolution,
      requestedAgent: TuiAgent | null,
      workspaceNameSeed: string,
      workspaceRunContext: WorktreeCreationRequest['workspaceRunContext'],
      repoId: string,
      options?: QuickSubmitOptions,
      handoff?: ComposerCreateHandoff
    ): Promise<void> => {
      const prepared = await prepareQuickSubmit(
        smartGitHubResolution,
        requestedAgent,
        workspaceNameSeed
      )

      if (!prepared) {
        return
      }

      const {
        submitLinkedWorkItem,
        agent,
        submitLinkedIssueNumber,
        submitLinkedPR,
        workspaceName,
        nameWasGenerated,
        nameIsAutoManaged,
        submitCompareBaseRef,
        submitPushTarget,
        effectiveSetupDecision,
        hookPreparation,
        linkedLinearIssue,
        linkedLinearIssueWorkspaceId,
        linkedLinearIssueOrganizationUrlKey,
        effectiveBranchNameOverride,
        branchIntent,
        submitBaseBranch,
        createDisplayName,
        pendingFirstAgentMessageRename,
        trimmedNote
      } = prepared

      const promptLinkedWorkItem = agent === null ? null : submitLinkedWorkItem

      // What the agent is asked on its first turn is the composer's prompt field. The note
      // became that text by default when the modal stopped drawing the prompt — it is still
      // honored as the fallback so saved drafts and callers that only set a note keep working,
      // but a surface that offers both must not silently drop what the user typed as the ask.
      const firstTurnText = agentPrompt.trim() || trimmedNote
      const { prompt: quickPrompt, draftPrompt: quickDraftPrompt } =
        resolveQuickCreateLinkedWorkItemPrompt(promptLinkedWorkItem, firstTurnText)

      const startupPolicySettlement = await settleComposerSubmit(
        persistSetupAgentStartupPolicy(),
        isSubmissionCancelled
      )

      if (startupPolicySettlement.status === 'cancelled') {
        return
      }

      if (!startupPolicySettlement.value) {
        throw new Error(
          translate(
            'auto.hooks.useComposerState.setupAgentStartupPolicySaveFailed',
            'Failed to save setup startup behavior.'
          )
        )
      }

      let ephemeralVmRecipe: WorktreeCreationRequest['ephemeralVmRecipe']

      const activeEphemeralVmRecipeId = ephemeralVmsEnabled ? selectedEphemeralVmRecipeId : null

      if (activeEphemeralVmRecipeId && selectedWorkspaceTarget.status === 'ready') {
        const selectedRecipe = ephemeralVmRecipes.find(
          (recipe) => recipe.id === activeEphemeralVmRecipeId
        )
        ephemeralVmRecipe = {
          sourceRepoId: repoId,
          recipeId: activeEphemeralVmRecipeId,
          projectId: selectedWorkspaceTarget.target.projectId,
          ...(selectedRecipe?.checkoutMode ? { checkoutMode: selectedRecipe.checkoutMode } : {})
        }
      }

      const promptDelivery = quickDraftPrompt ? 'draft' : 'auto-submit'
      // Why: the verdict is persisted on the request as data and re-entered once the worktree exists.
      const agentLaunchRoute = !agent
        ? 'terminal-tui'
        : (options?.launchChoice?.route ??
          resolveAgentSessionLaunchRoute(useAppStore.getState(), {
            agent,
            workspace: {
              kind: selectedRepoIsGit ? 'git-worktree' : 'folder',
              repoId,
              executionHostId: ephemeralVmRecipe
                ? 'runtime:pending-ephemeral-vm'
                : (workspaceRunContext?.hostId ?? selectedRepoExecutionHostId ?? undefined)
            },
            prompt: quickDraftPrompt ?? quickPrompt,
            promptDelivery
          }))
      const structuredLaunch = agentLaunchRoute === 'structured-native-chat'

      const quickStartup = await prepareQuickComposerStartup({
        agent,
        linkedWorkItem: submitLinkedWorkItem,
        note: trimmedNote,
        repoId,
        executionHostId: selectedRepoExecutionHostId,
        settings,
        launchHost: selectedRepoAgentLaunchFact,
        shell: selectedRepoStartupShell,
        isRemote: selectedRepoIsRemote,
        telemetrySource,
        route: agentLaunchRoute,
        launchInputs: options?.launchInputs,
        legacyLaunchInputs: options?.legacyLaunchInputs,
        ephemeralVm: Boolean(ephemeralVmRecipe)
      })

      if (isSubmissionCancelled()) {
        return
      }
      if (quickStartup.creationStartup) {
        quickStartup.creationStartup.onLegacyPreparationFailure =
          options?.onLegacyPreparationFailure
      }
      const request = buildQuickCreationRequest({
        repoId,
        ephemeralVmRecipe,
        indeterminateProgress:
          Boolean(activeEphemeralVmRecipeId) || selectedRepoTarget?.kind === 'environment',
        taskSourceContext,
        linkedWorkItem: submitLinkedWorkItem,
        workspaceRunContext,
        workspaceName,
        nameWasGenerated,
        displayName: createDisplayName,
        displayNameKind: createDisplayName ? (nameIsAutoManaged ? 'generated' : 'user') : undefined,
        selectedRepoIsGit,
        baseBranch: submitBaseBranch,
        compareBaseRef: submitCompareBaseRef,
        setupDecision: effectiveSetupDecision,
        sparseDirectories: selectedRepoIsGit && sparseEnabled ? normalizedSparseDirectories : null,
        sparsePresetId: effectivePresetId,
        telemetrySource,
        linkedIssue: submitLinkedIssueNumber,
        linkedPR: submitLinkedPR,
        pushTarget: submitPushTarget,
        agent,
        agentLaunchRoute,
        launchInputs: options?.launchInputs,
        legacyLaunchInputs: options?.legacyLaunchInputs,
        creationStartup: quickStartup.creationStartup,
        linkedLinearIssue,
        linkedLinearIssueWorkspaceId,
        linkedLinearIssueOrganizationUrlKey,
        branchNameOverride: effectiveBranchNameOverride,
        branchIntent,
        parentWorktreeId,
        // A lane's host-only column applies only when creating on that host.
        workspaceStatus:
          resolvedInitialWorkspaceStatus &&
          isWorkspaceStatusAllowedOnHost(
            useAppStore.getState(),
            {
              hostId: workspaceRunContext?.hostId ?? selectedRepoExecutionHostId,
              runtimeOwnerEnvironmentId:
                selectedRepoTarget?.kind === 'environment' ? selectedRepoTarget.environmentId : null
            },
            resolvedInitialWorkspaceStatus
          )
            ? resolvedInitialWorkspaceStatus
            : undefined,
        linkedGitLabMR,
        linkedGitLabIssue,
        includeGitLabLinks: smartGitHubResolution.kind === 'none',
        startup: structuredLaunch ? undefined : quickStartup.backendStartup,
        hookPreparation: ephemeralVmRecipe
          ? {
              ...hookPreparation,
              executionHostId: selectedRepoExecutionHostId ?? undefined,
              confirmVmRecipe: true
            }
          : hookPreparation,
        pendingFirstAgentMessageRename,
        note: trimmedNote,
        startupPlan: quickStartup.startupPlan,
        quickPrompt,
        launchDraftPrompt: quickDraftPrompt,
        promptDelivery,
        quickTelemetry: quickStartup.telemetry,
        suppressTerminalFocusOnCompletion: createMultiple,
        setupOnly: options?.setupOnly === true
      })

      if (isSubmissionCancelled()) {
        return
      }

      if (persistDraft) {
        clearNewWorkspaceDraft()
      }

      if (handoff) {
        handoff.start(request)
      } else {
        runBackgroundWorktreeCreation(request)
      }

      // The composer already closed at handoff; closing again could dismiss a newer modal.
      if (handoff?.isHandedOff()) {
        return
      }

      if (createMultiple) {
        resetForNextCreate()
      } else {
        onCreated?.()
      }
    },
    [
      agentPrompt,
      clearNewWorkspaceDraft,
      createMultiple,
      effectivePresetId,
      ephemeralVmRecipes,
      ephemeralVmsEnabled,
      isSubmissionCancelled,
      linkedGitLabIssue,
      linkedGitLabMR,
      normalizedSparseDirectories,
      onCreated,
      parentWorktreeId,
      persistDraft,
      persistSetupAgentStartupPolicy,
      prepareQuickSubmit,
      resetForNextCreate,
      resolvedInitialWorkspaceStatus,
      selectedEphemeralVmRecipeId,
      selectedRepoAgentLaunchFact,
      selectedRepoExecutionHostId,
      selectedRepoIsGit,
      selectedRepoIsRemote,
      selectedRepoTarget,
      selectedRepoStartupShell,
      selectedWorkspaceTarget,
      settings,
      sparseEnabled,
      taskSourceContext,
      telemetrySource
    ]
  )

  return {
    executeQuickCreation
  }
}
