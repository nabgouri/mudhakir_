import { Alert } from 'react-native';

import { t } from './strings';

export function confirmDeleteQuestion(onDelete: () => Promise<void>) {
  Alert.alert(t.deleteQuestionTitle, t.deleteQuestionMessage, [
    { text: t.cancel, style: 'cancel' },
    { text: t.delete, style: 'destructive', onPress: onDelete },
  ]);
}
