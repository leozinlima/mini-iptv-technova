# Scripts por ETAPA (rodar aos poucos, sem digitar comandos)

Cada máquina tem uma pasta com os scripts **numerados**. Em cada computador, rode os scripts
da pasta dela **em ordem** (01, 02, 03, ...) e por fim o `99-tests.sh`. Assim vocês vão
avançando etapa por etapa, sem copiar comando no terminal.

```
scripts/
├── common/           <- motor compartilhado (NÃO precisa rodar)
│   ├── vars.env      <- variáveis (IPs, domínio, nº de canais, interfaces)
│   └── utils.sh      <- funções usadas por todos os scripts
├── S/   01-base  02-network  03-dns-smtp  04-vlc-backend  99-tests
├── R1/  01-base  02-network  03-nat-iptables  04-apache-gateway  05-ppp-multicast  99-tests
├── R2/  01-base  02-ppp  03-dhcp  04-routing-multicast  99-tests
├── X/   01-dhcp-client  02-client-app-vlc  99-tests
└── Y/   (igual ao X)
```

## Como rodar (em cada máquina)

Abra o terminal na máquina certa e rode, **um por vez**:

```bash
sudo bash scripts/S/01-base.sh
sudo bash scripts/S/02-network.sh
sudo bash scripts/S/03-dns-smtp.sh
sudo bash scripts/S/04-vlc-backend.sh
sudo bash scripts/S/99-tests.sh
```

(troque `S` por `R1`, `R2`, `X` ou `Y` conforme a máquina).

> **Sobre o caminho:** os comandos acima são relativos, então rode a partir de `~/Mini-IPTV`
> (`cd ~/Mini-IPTV`). Se preferir, funciona de qualquer lugar com o caminho completo:
> `sudo bash ~/Mini-IPTV/scripts/S/01-base.sh` (os scripts acham o `common/` sozinhos).
>
> **Quer fazer tudo na mão (sem os scripts)?** Todos os comandos estão em
> [`../COMANDOS_MANUAIS.md`](../COMANDOS_MANUAIS.md).

> Se preferir rodar **tudo de uma vez** numa máquina, use:
> `sudo bash scripts/RUN_ALL.sh S`  (ou R1, R2, X, Y).

## Ordem entre as máquinas (importante)

Faça a **etapa 01 (base) com internet** em todas, depois monte a topologia:

```
1) R1 : 01 -> 02 -> 03 (NAT: já dá internet aos outros) -> 04
2) S  : 01 -> 02 -> 03 -> 04
3) R2 : 01 -> 02 (PPP)
4) R1 : 05 (PPP + multicast)      <- os dois lados do PPP juntos
5) R2 : 03 (DHCP) -> 04 (rotas + multicast)
6) X e Y : 01 -> 02
7) 99-tests em todas
```

O **PPP precisa dos dois lados**: se `R1/05` ou `R2/02` disser que o `ppp0` não subiu,
rode o script de novo depois que o outro lado estiver ligado.

## Interfaces e serial

Os scripts **detectam sozinhos** as placas e a serial (`/dev/ttyUSB0` no físico,
`/dev/ttyS0` na VM). Se a detecção errar, escreva o nome real em `common/vars.env`
(campos `IF_S`, `IF_R1_LAN1`, `IF_R1_LAB`, `IF_R2_LAN2`, `IF_CLIENT`, `SERIAL`).

## Serve para FÍSICO e para MÁQUINA VIRTUAL

Sim — **os mesmos scripts** funcionam nos dois. Eles detectam sozinhos a serial
(`/dev/ttyUSB0` no físico, `/dev/ttyS0` na VM) e as placas de rede. O que muda é só a
preparação do hardware/VirtualBox **antes** de rodar os scripts:

- **Físico:** cabos + switch reais; cabo serial cross RS-232 (adaptador USB-serial) entre R1 e R2;
  R1 na rede cabeada do laboratório (internet).
- **VirtualBox (5 VMs):** Redes Internas `LAN1` (S↔R1) e `LAN2` (R2↔X↔Y); R1 com adaptador
  **NAT** (faz o papel da internet do lab); **porta serial por "pipe do host"** ligando R1 e R2.
  O passo a passo do VirtualBox (com os comandos `VBoxManage`) está em
  **`../automacao/LEIA_PRIMEIRO.md`** (seção "Se for em MÁQUINA VIRTUAL").

Depois dessa preparação, rode os scripts de etapa igual em qualquer um dos dois casos.

## Para parar/limpar
`sudo bash automacao/parar_tudo.sh` (na pasta ao lado) encerra backend, VLC, PPP,
multicast e limites de banda em qualquer máquina.

> Observação: a pasta `automacao/` (com `AUTO.sh`) continua existindo — é a versão
> "roda tudo de uma vez". Esta pasta `scripts/` é a versão **por etapas**. Use a que preferir.
