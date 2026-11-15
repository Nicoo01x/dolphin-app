import { translate } from '@/i18n/i18n'
import {
  NATIVE_CHAT_DOLPHIN_STOP_COPY as COPY,
  type NativeChatDolphinStopCopyId,
  type NativeChatDolphinStopSay
} from '../../../../../../shared/native-chat/native-chat-dolphin-stop-words'

const PIECES: Record<NativeChatDolphinStopCopyId, (machine: string | undefined) => string> = {
  update: (machine) =>
    translate('components.native-chat.notices.dolphinStopUpdate', COPY.update, { machine }),
  quit: (machine) =>
    translate('components.native-chat.notices.dolphinStopQuit', COPY.quit, { machine }),
  crash: (machine) =>
    translate('components.native-chat.notices.dolphinStopCrash', COPY.crash, { machine }),
  remote: (machine) =>
    translate('components.native-chat.notices.dolphinStopRemote', COPY.remote, { machine }),
  canContinue: () =>
    translate('components.native-chat.notices.dolphinStopCanContinue', COPY.canContinue),
  unnamedServer: () =>
    translate('components.native-chat.notices.dolphinStopUnnamedServer', COPY.unnamedServer)
}

export const sayNativeChatDolphinStopTranslated: NativeChatDolphinStopSay = (id, machine) =>
  PIECES[id](machine)
