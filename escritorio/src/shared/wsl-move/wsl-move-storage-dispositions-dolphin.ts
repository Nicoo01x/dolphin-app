/**
 * Los módulos de Dolphin que usan localStorage y que el censo de la mudanza a WSL tiene que conocer:
 * preferencias locales, la migración de claves y menciones documentales.
 *
 * Why aparte: la base los anota en una lista que vive en su tope de líneas; esta se suma con un spread.
 */
export const MODULOS_DOLPHIN_CON_LOCAL_STORAGE: readonly string[] = [
  'src/renderer/src/components/dolphin/chat/DolphinChatBar.tsx',
  'src/renderer/src/components/dolphin/isla/use-preferencias-isla.ts',
  'src/renderer/src/components/lienzo/lienzo-disposicion.ts',
  'src/renderer/src/components/native-chat/use-native-chat-session-side-panel-visibility.ts',
  'src/renderer/src/components/terminal-pane/use-dolphin-chat-sobre-el-cli.ts',
  'src/renderer/src/lib/dolphin-storage-key-migration.ts',
  'src/renderer/src/main.tsx',
  'src/renderer/src/web/main.tsx',
  'src/shared/dolphin-isla-types.ts'
]
