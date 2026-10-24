import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';

import LoginScreen from '../../app/(auth)/login';
import { authStore } from '.';

async function fillIn(username: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('Username'), username);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
}

describe('LoginScreen', () => {
  beforeEach(() => authStore.getState().signedOut());

  it('keeps Log in disabled until both fields are filled', async () => {
    await render(<LoginScreen />);
    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled();
    await fillIn('kapekost', 'correct horse battery');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });

  it('shows the server message for a wrong password', async () => {
    await render(<LoginScreen />);
    await fillIn('kapekost', 'wrong');
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid username or password');
    expect(authStore.getState().status).toBe('signedOut');
  });

  it('signs in and keeps the session cookie from Set-Cookie', async () => {
    await render(<LoginScreen />);
    await fillIn('kapekost', 'correct horse battery');
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(authStore.getState().status).toBe('signedIn'));
    expect(authStore.getState().profile?.username).toBe('kapekost');
    expect(await SecureStore.getItemAsync('wt_session')).toBe('abc123');
  });
});
