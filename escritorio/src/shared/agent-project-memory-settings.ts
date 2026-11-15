export type AgentProjectMemorySettings = {
  /** Send approved project memory to supported agent hooks. */
  agentProjectMemoryEnabled: boolean
  /** Keep unapproved correction candidates in the project's memory file. */
  agentProjectMemoryLearningEnabled: boolean
}
