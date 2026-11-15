import { translate } from '@/i18n/i18n'
import { searchKeywords } from './search/settings-search-keywords'

export function getAgentProjectMemoryTitle(): string {
  return translate(
    'auto.components.settings.agent-project-memory-copy.title',
    'Pass project memory to agents'
  )
}

export function getAgentProjectMemoryDescription(): string {
  return translate(
    'auto.components.settings.agent-project-memory-copy.description',
    "Shares Dolphin's approved rules, decisions, and learnings with the project's agents."
  )
}

export function getAgentProjectMemoryLearningTitle(): string {
  return translate(
    'auto.components.settings.agent-project-memory-copy.learningTitle',
    'Learn from my corrections'
  )
}

export function getAgentProjectMemoryLearningDescription(): string {
  return translate(
    'auto.components.settings.agent-project-memory-copy.learningDescription',
    'Saves your corrections as project-memory candidates for you to approve.'
  )
}

export function getAgentProjectMemorySearchKeywords(): string[] {
  return searchKeywords([
    { key: 'auto.components.settings.agents.search.projectMemory', fallback: 'project memory' },
    { key: 'auto.components.settings.agents.search.memory', fallback: 'memory' },
    { key: 'auto.components.settings.agents.search.corrections', fallback: 'corrections' },
    { key: 'auto.components.settings.agents.search.learn', fallback: 'learn' },
    { key: 'auto.components.settings.agents.search.rules', fallback: 'rules' }
  ])
}
