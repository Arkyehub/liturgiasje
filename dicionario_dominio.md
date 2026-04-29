# Dicionário de Domínio (Linguagem Ubíqua) - Liturgia SJE

Este documento define os termos técnicos e de negócio utilizados no sistema Liturgia SJE, garantindo uma linguagem comum entre desenvolvedores e usuários (Padroeiros/Leitores).

## Entidades de Negócio

### Leitor (Reader / Member)
- **Definição**: Pessoa cadastrada no sistema que realiza leituras nas missas.
- **Termo Técnico**: `Member` (quando se refere ao registro na lista) ou `Reader` (quando se refere ao papel na escala).
- **Atributos Principais**: `fullName`, `whatsapp`, `avatarUrl`.

### Escala (Schedule / Mass)
- **Definição**: Organização dos leitores para as missas de um determinado período (geralmente um mês).
- **Termo Técnico**: `Mass` (um horário específico na escala) ou `Schedule` (o conjunto).
- **Atributos Principais**: `date`, `time`, `specialDescription`, `isPublished`.

### Horário / Vaga (Slot)
- **Definição**: Uma posição específica dentro de uma Missa para uma função litúrgica (1ª Leitura, 2ª Leitura, Comentarista, Preces).
- **Termo Técnico**: `ScheduleSlot`.
- **Estados**: `isConfirmed`, `isSwapRequested`.

### Aviso / Recado (Announcement)
- **Definição**: Comunicações importantes postadas pela coordenação para os leitores.
- **Termo Técnico**: `Announcement`.
- **Tipos**: `Aviso` (geral) ou `Troca` (automático quando há solicitação de troca).

### Troca (Swap)
- **Definição**: Processo onde um leitor solicita que outro assuma sua vaga em um horário específico.
- **Termo Técnico**: `SwapRequest`.

## Papéis e Permissões

### Administrador (Admin)
- Usuário com permissão para criar escalas, gerenciar membros e publicar avisos.

### Leitor (Reader / User)
- Usuário que pode visualizar escalas, confirmar presença e solicitar trocas.

## Estados e Processos

### Rascunho (Draft / isPublished: false)
- Escala que ainda não foi liberada para visualização geral. Apenas administradores veem.

### Publicado (Published / isPublished: true)
- Escala liberada para todos os leitores.

### Confirmado (Confirmed)
- Quando o leitor sinaliza que está ciente e comparecerá ao horário escalado.

### Indisponibilidade (Unavailable)
- Datas informadas pelo leitor onde ele antecipadamente avisa que não poderá ser escalado.

## Mapeamento de Dados (Arquitetura)

- **Camada de Domínio (Domain)**: Utiliza `camelCase` (ex: `fullName`).
- **Camada de Banco de Dados (Database/Supabase)**: Utiliza `snake_case` (ex: `full_name`).
- **Repositórios (Data Layer)**: Responsáveis pela tradução entre esses dois formatos.
