# Design System - Liturgia SJE

Este documento define os princípios visuais, componentes e tokens de design do sistema Liturgia SJE, garantindo uma experiência de usuário (UX) premium, moderna e coesa.

## 🎨 Princípios Estéticos

### 1. Estética Premium (Rich Aesthetics)
- **Vibe**: Solene, moderna, limpa e funcional.
- **Estilo**: Uso de glassmorphism sutil, bordas arredondadas generosas (3xl/2xl) e sombras suaves para criar profundidade.
- **Tipografia**: Uso da fonte **Inter** para máxima legibilidade e um toque moderno. Títulos em negrito extra (black) para hierarquia clara.

### 2. Paleta de Cores (Tokens)
Utilizamos cores que evocam solidez e elegância:
- **Stone (Pedra)**: Tons de cinza quentes (`stone-800`, `stone-500`, `stone-50`) como base para textos e superfícies.
- **Amber (Âmbar)**: Utilizado para destaques litúrgicos e estados de atenção sutil (`amber-600`, `amber-100`).
- **Green (Verde)**: Para ações positivas e confirmações (`green-600`, `green-50`).
- **Red (Vermelho)**: Para avisos urgentes ou exclusões (`red-600`, `red-50`).

## 🧱 Componentes Core

### Cartões (Cards)
- **Estilo**: Fundo branco ou `stone-50/30`, borda `stone-100`, arredondamento `rounded-3xl`.
- **Interação**: Efeito de escala sutil no toque/hover (`active:scale-95`).

### Botões (Buttons)
- **Primário**: Fundo `stone-800`, texto branco, fonte `font-bold`, arredondamento `rounded-xl` ou `rounded-2xl`.
- **Sucesso**: Fundo `green-600`, focado em ações de salvamento e publicação.

### Tipografia (Typography)
- **Títulos**: `font-black`, `tracking-tight`, `text-stone-800`.
- **Subtítulos/Labels**: `text-[10px]`, `font-bold`, `uppercase`, `tracking-widest`, `text-stone-400`.

## ✨ Micro-animações
- Uso de `animate-in`, `fade-in`, `slide-in-from-bottom` para entradas suaves de conteúdo.
- Transições de cor e escala de 200ms para feedback tátil.

## 📱 PWA & Mobile First
- Design pensado inteiramente para dispositivos móveis (viewport max-width: 448px).
- Área de toque mínima de 44px para todos os elementos interativos.
- Splash screen e cores de tema (`theme-color: #322113`) integrados.
