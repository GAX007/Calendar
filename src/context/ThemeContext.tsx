import React, { createContext, useContext, useEffect } from 'react';

// The app is light only. The context stays so existing imports keep working.
type ThemeMode = 'light';

interface ThemeContextType {
  theme: ThemeMode;
  isDark: false;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const noop = () => {};
const value: ThemeContextType = { theme: 'light', isDark: false, toggleTheme: noop, setTheme: noop };
const ThemeContext = createContext<ThemeContextType>(value);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    try {
      localStorage.removeItem('calendarasist_theme_mode');
    } catch {
      // private mode
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#ffffff');
  }, []);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
