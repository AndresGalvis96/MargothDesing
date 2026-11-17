import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

const decodificarJWT = (token) => {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(window.atob(base64));
    } catch {
        return null;
    }
};

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(() => localStorage.getItem('token'));
    const [usuario, setUsuario] = useState(() => {
        const savedToken = localStorage.getItem('token');
        const savedUser = localStorage.getItem('usuario');
        if (!savedToken) return null;
        const payload = decodificarJWT(savedToken);
        const extra = savedUser ? JSON.parse(savedUser) : {};
        return payload ? { ...extra, ...payload } : null;
    });

    const iniciarSesion = (nuevoToken, datosUsuario = {}) => {
        localStorage.setItem('token', nuevoToken);
        localStorage.setItem('usuario', JSON.stringify(datosUsuario));
        const payload = decodificarJWT(nuevoToken);
        setToken(nuevoToken);
        setUsuario(payload ? { ...datosUsuario, ...payload } : datosUsuario);
    };

    const cerrarSesion = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        setToken(null);
        setUsuario(null);
    };

    const rutaInicioPorRol = (rol) => {
        if (rol === 'cliente') return '/catalogo';
        if (rol === 'operario') return '/taller/pedidos';
        if (rol === 'admin_global') return '/global/talleres';
        return '/taller/dashboard';
    };

    return (
        <AuthContext.Provider value={{ token, usuario, iniciarSesion, cerrarSesion, rutaInicioPorRol }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);