# Guia — Mini-IPTV em VirtualBox (5 VMs)

Passo a passo **completo e direto** para rodar o projeto em máquinas virtuais.
São 5 VMs: **S** (servidor), **R1** (roteador + NAT + gateway), **R2** (roteador + DHCP),
**X** e **Y** (clientes WAN). Só o **R1** precisa de internet — ele é a saída dos outros.

> **Índice**
> 1. [Topologia (quem é quem)](#1-topologia-quem-é-quem)
> 2. [Criar a VM Base](#2-criar-a-vm-base)
> 3. [Configurar rede + serial no VirtualBox](#3-configurar-rede--serial-no-virtualbox)
> 4. [Colocar o projeto nas VMs](#4-colocar-o-projeto-nas-vms) ← **onde entra o git clone**
> 5. [Rodar os scripts (ordem certa)](#5-rodar-os-scripts-ordem-certa)
> 6. [Usar / demonstrar](#6-usar--demonstrar)
> 7. [Parar / limpar](#7-parar--limpar)
> 8. [Problemas comuns](#8-problemas-comuns)

---

## 1. Topologia (quem é quem)

```
      LAN1 (172.16.0.0/16)                 WAN serial 115200            LAN2 (192.168.0.0/24)
  ┌─────────┐        ┌──────────┐        ppp0 10.0.0.1 ── 10.0.0.2       ┌──────────┐   ┌─────┐
  │    S    │────────│    R1    │══════════════ /dev/ttyS0 ═════════════│    R2    │───│ X,Y │
  │172.16.0.2│ LAN1  │172.16.0.1│                                        │192.168.0.1│  │DHCP │
  └─────────┘        └────┬─────┘                                        └──────────┘   └─────┘
   DNS,SMTP,VLC,          │ NAT
   backend, gateway    (internet)
```

| VM | Papel | IP LAN | Internet? |
|----|-------|--------|-----------|
| **S**  | DNS, SMTP, VLC Server, backend, gateway Apache | 172.16.0.2 (LAN1) | via R1 |
| **R1** | Roteador, Source NAT, saída pra internet | 172.16.0.1 (LAN1) + NAT | **SIM (nativo)** |
| **R2** | Roteador WAN, DHCP Server da LAN2 | 192.168.0.1 (LAN2) | via R1 (PPP) |
| **X**  | Cliente WAN (navegador + VLC) | DHCP (LAN2) | via R2→R1 |
| **Y**  | Cliente WAN (navegador + VLC) | DHCP (LAN2) | via R2→R1 |

---

## 2. Criar a VM Base

Baixe a **ISO do Ubuntu Desktop** (LTS 22.04 ou 24.04) em ubuntu.com/download/desktop.

No VirtualBox → **Novo**:

| Tela | O que pôr |
|------|-----------|
| **Nome/SO** | Nome `Base`; escolha a **ISO do Ubuntu**; Tipo **Linux**, Versão **Ubuntu (64-bit)**. Se vier "Windows", **corrija pra Linux**. Marque "Pular Instalação Desassistida". |
| **Hardware** | Memória `2048 MB`; Processadores `2`. |
| **Disco** | Criar novo, `25 GB`, **sem** pré-alocar. |
| **Sumário** | Confirme **Linux / Ubuntu (64-bit)** → Finalizar. |

Inicie a Base e **instale o Ubuntu** normalmente (sugestão: usuário `aluno` / senha `aluno`).
Deixe a rede em **NAT** durante a preparação (pra ter internet).

**Instale todos os pacotes de uma vez** (dentro da Base, com internet):

```bash
sudo apt update
sudo apt install -y vlc ffmpeg ppp smcroute tcpdump iproute2 net-tools iptables \
  apache2 bind9 bind9-utils dnsutils postfix dovecot-pop3d dovecot-imapd \
  isc-dhcp-server nodejs git curl unzip
```

> **Telas azuis do Postfix:** 1) `<Ok>`; 2) escolha **Site da Internet**; 3) deixe o nome
> como está. Navegue com **setas / Tab / Enter**. O script do S ajusta o domínio depois.

---

## 3. Configurar rede + serial no VirtualBox

Faça com as VMs **desligadas** (Configurações de cada VM).

### 3.1 Placas de rede

| VM | Adaptador 1 | Adaptador 2 |
|----|-------------|-------------|
| S  | Rede Interna, Nome **LAN1** | — |
| R1 | **NAT** | Rede Interna, Nome **LAN1** |
| R2 | Rede Interna, Nome **LAN2** | — |
| X  | Rede Interna, Nome **LAN2** | — |
| Y  | Rede Interna, Nome **LAN2** | — |

> **Modo Promíscuo (multicast!):** em cada placa de **Rede Interna**, abra **Avançado** e ponha
> **Modo Promíscuo = Permitir Tudo**. Aplique em: S(ad.1), **R1 só no ad.2 (LAN1)**, R2(ad.1),
> X(ad.1), Y(ad.1). No **R1 ad.1 (NAT) o campo fica cinza — é normal**, deixe assim.

### 3.2 Porta serial = o "cabo WAN" entre R1 e R2

Só no **R1 e R2**, aba **Porta 1** (Portas Seriais):

| Campo | R1 | R2 |
|---|---|---|
| Habilitar Porta Serial | ☑ | ☑ |
| Número da Porta | COM1 | COM1 |
| Modo da Porta | **Pipe no Hospedeiro** | **Pipe no Hospedeiro** |
| Conectar a pipe existente | **☐ DESMARCADO** (R1 cria) | **☑ MARCADO** (R2 conecta) |
| Caminho | `/tmp/wan_serial` | `/tmp/wan_serial` |

> Dentro das VMs essa serial vira **`/dev/ttyS0`** (os scripts detectam sozinhos).
> No Windows hospedeiro, use `\\.\pipe\wan_serial`.

### 3.3 (Alternativa) tudo pelo terminal do hospedeiro

```bash
VBoxManage modifyvm "S"  --nic1 intnet --intnet1 LAN1
VBoxManage modifyvm "R1" --nic1 nat --nic2 intnet --intnet2 LAN1
VBoxManage modifyvm "R2" --nic1 intnet --intnet1 LAN2
VBoxManage modifyvm "X"  --nic1 intnet --intnet1 LAN2
VBoxManage modifyvm "Y"  --nic1 intnet --intnet1 LAN2
VBoxManage modifyvm "R1" --uart1 0x3F8 4 --uartmode1 server /tmp/wan_serial
VBoxManage modifyvm "R2" --uart1 0x3F8 4 --uartmode1 client /tmp/wan_serial
```

---

## 4. Colocar o projeto nas VMs

O projeto precisa estar em **`~/mini-iptv-vm`** em cada VM. Há duas estratégias — a **A é a
recomendada** (evita toda a dança de internet).

### Estratégia A — baixar 1x na Base e clonar (RECOMENDADO)

Na **Base** (que tem internet por NAT), baixe o projeto e desligue:

```bash
git clone https://github.com/leozinlima/mini-iptv-technova.git ~/mini-iptv-vm
ls ~/mini-iptv-vm/scripts     # deve listar: common S R1 R2 X Y
sudo poweroff
```

Agora **clone a Base 5 vezes** (botão direito → Clonar), criando `S, R1, R2, X, Y`:
- **Política de Endereço MAC:** "Gerar novos MAC para todas as placas" ⚠️ (essencial).
- **Clone Linkado** (economiza disco) → Finalizar.

Pronto — as 5 VMs já nascem com `~/mini-iptv-vm`. Pule para a [Parte 5](#5-rodar-os-scripts-ordem-certa).

### Estratégia B — baixar por VM (se não quiser clonar a Base)

Aqui vale a regra do **ovo e a galinha**: só quem tem internet consegue `git clone`.

**R1** (tem internet nativa por NAT):
```bash
git clone https://github.com/leozinlima/mini-iptv-technova.git ~/mini-iptv-vm
cd ~/mini-iptv-vm
# rode já a base + rede + NAT do R1 (Parte 5, passo 1) para virar o gateway
```

**S** (está direto na LAN1 → pega internet pelo R1 **depois** que o R1 vira gateway):
```bash
sudo ip addr add 172.16.0.2/24 dev enp0s3 2>/dev/null
sudo ip route replace default via 172.16.0.1 dev enp0s3
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf
ping -c2 github.com          # tem que resolver (via NAT do R1)
git clone https://github.com/leozinlima/mini-iptv-technova.git ~/mini-iptv-vm
```

**R2, X, Y** — **NÃO dá pra clonar** (só teriam internet depois do PPP, que precisa deles já
prontos). Leve a pasta por **pendrive** (use o `mini-iptv-vm.zip`):
```bash
cp /media/$USER/*/mini-iptv-vm.zip ~/ && cd ~ && unzip -o mini-iptv-vm.zip
```

> Por isso a Estratégia A é melhor: baixa 1x, clona 5, e ninguém fica sem a pasta.

---

## 5. Rodar os scripts (ordem certa)

Ligue as VMs (**R1 primeiro**, pois ele cria o pipe serial). Em **cada** VM:

```bash
cd ~/mini-iptv-vm
```

As placas na VM são `enp0s3`/`enp0s8` — **os scripts detectam sozinhos**, não edite nada.

```text
1) R1 :  sudo bash scripts/R1/01-base.sh
         sudo bash scripts/R1/02-network.sh
         sudo bash scripts/R1/03-nat-iptables.sh      # já dá internet aos outros
         sudo bash scripts/R1/04-apache-gateway.sh

2) S  :  sudo bash scripts/S/01-base.sh
         sudo bash scripts/S/02-network.sh
         sudo bash scripts/S/03-dns-smtp.sh
         sudo bash scripts/S/04-vlc-backend.sh

3) R2 :  sudo bash scripts/R2/01-base.sh
         sudo bash scripts/R2/02-ppp.sh               # sobe o PPP (lado R2)

4) R1 :  sudo bash scripts/R1/05-ppp-multicast.sh     # sobe o PPP (lado R1) + multicast

5) R2 :  sudo bash scripts/R2/03-dhcp.sh
         sudo bash scripts/R2/04-routing-multicast.sh # SEMPRE rodar depois do R1/05

6) X  :  sudo bash scripts/X/01-dhcp-client.sh
         sudo bash scripts/X/02-client-app-vlc.sh
   Y  :  (igual ao X)

7) Conferir:  sudo bash scripts/<MAQUINA>/99-tests.sh
```

### Regras de ouro (o que mais confunde)

- **O `R2/02-ppp` termina com `[ERRO] ppp0 não subiu` — isso é NORMAL.** O PPP precisa dos dois
  lados; o R2 fica tentando sozinho (`persist`). Quando você roda o **`R1/05`** (passo 4), os
  dois conectam.
- **Sempre rode `R2/04` DEPOIS de `R1/05`.** Se você rodar o `R1/05` de novo (ele derruba e
  sobe o PPP), rode o `R2/04` outra vez pra recriar as rotas de multicast/internet do R2.
- **Só o R1 tem internet.** Os outros saem por ele: S direto pela LAN1; R2/X/Y pela WAN (PPP).

---

## 6. Usar / demonstrar

Nas VMs **X** e **Y**, abra o navegador em:

```
http://iptv.tecnova.com.br        (ou http://172.16.0.1)
```

- Login OAuth2: **joao/123** e **maria/123** (perfil WAN), **admin/admin** (painel de administração).
- Clique **Assistir** num canal. O perfil WAN toca **1 canal por vez** (é a regra do enunciado);
  o site abre o `udp://@239.20.4.<canal>:5004` no **VLC**.
- Se o navegador for o **Firefox snap** e não abrir o VLC sozinho, abra no VLC na mão:
  **Mídia → Abrir Fluxo de Rede →** cole o `udp://@239.20.4.<canal>:5004`.

**Demonstração das regras:** X assiste o canal 1; Y tenta outro canal → o de X para (WAN = 1 por
vez). No R1 ou R2, `sudo tcpdump -ni ppp0 udp` mostra **um único fluxo** atravessando a WAN.

---

## 7. Parar / limpar

Em qualquer VM, para encerrar backend, VLC, PPP e multicast:

```bash
sudo pkill -f cvlc
sudo pkill -f 'node .*server.js' ; sudo pkill -f authserver.js
sudo poff -a 2>/dev/null ; sudo pkill pppd
sudo smcroutectl kill 2>/dev/null
```

Ou simplesmente desligue as VMs.

---

## 8. Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `git clone` diz **"Could not resolve host"** | VM sem internet/DNS | é a Estratégia B: só R1/S clonam; R2/X/Y por pendrive. Ou use a Estratégia A. |
| R1 sem internet | placa NAT (`enp0s3`) com config estática antiga | `sudo nmcli con delete iptv-enp0s3; sudo nmcli con add type ethernet ifname enp0s3 con-name nat ipv4.method auto; sudo nmcli con up nat` |
| `ppp0` não sobe | o outro lado ainda não rodou o PPP | rode `R1/05` e `R2/02`; o R2 reconecta sozinho |
| Vídeo dos últimos canais não toca | R2 com `NCH` antigo (rotas de multicast faltando) | confira `NCH` em `scripts/common/vars.env` e rode `R2/04` de novo |
| X/Y sem IP | DHCP (R2) parado ou rotas caídas | conferir `R2/03` e `R2/04`; `systemctl status isc-dhcp-server` |
| Portal não abre em X | Apache/proxy ou rede | no R1: `curl http://127.0.0.1/api/channels`; conferir `R1/04` |
| Cliente aparece como perfil LAN em vez de WAN | X-Forwarded-For | já corrigido no gateway; confirme que rodou o `R1/04` atual |
| Vídeo trava na WAN | fluxo grande demais | o perfil WAN já usa `*_ld.mp4` (~80 kbps) — é o esperado |
