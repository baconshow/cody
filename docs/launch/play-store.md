# Play Store listing (draft)

The texts for the Google Play listing, in the two languages the app speaks. Limits: the short description is 80
characters at most, the full description 4,000. Both are written like a brochure on purpose, the way the README's
"The pitch" section is; everything in them is something the app does today. The listing also needs the privacy
policy URL (PRIVACY.md on GitHub), the foreground service declaration and the reviewer note from `docs/BACON-TODO.md`.

## App name

Cody · desk pet for Claude Code

## Short description (en)

Your Claude Code with a face and a voice. Heads-up on your phone. Private.

## Full description (en)

Cody is a little desk pet for Claude Code. It lives on your computer, and this app brings it to your phone.

BRING YOUR CLAUDE CODE TO LIFE
A voxel mascot that reacts, live, to what Claude is doing on your computer: it searches with a magnifier, types on a
tiny keyboard while Claude edits code, thinks while commands run, pulls out a bug when a test fails, throws confetti
when a long task is done, and falls asleep when Claude is closed.

COMMAND CLAUDE CODE BY VOICE
Say "Cody" and ask. Your words land in a real Claude Code session on your computer, with your files and your tools,
and the mascot answers out loud in two sentences. Ask quick questions about your code, have Claude change it ("add a
dark mode toggle to the settings page"), and approve what it wants to run with a spoken yes or no. Any MCP server
you already connected to Claude Code answers through Cody too. And a word for another conversation ("tell my other
session to run the tests") lands in that Claude session, open on the same computer, Claude Desktop included.

A HEADS-UP, EVEN WITH THE APP CLOSED
When a long task finishes or Claude is waiting for your permission, your phone buzzes with Cody's face and the words,
screen off or not. A home screen widget keeps the last heads-up.

KNOW WHERE YOU STAND WITH YOUR PLAN
"Cody, how much usage do I have left?": the session and the week, said out loud and shown on screen, with when each
one resets. Read from Claude Code's own status line, no API call.

A DESK BUDDY ON TOP
Timers and reminders that ring on the phone. A memory of your name and how you like things. "Take a screenshot and
send it to my WhatsApp." Scenes and skins.

YOURS, ON YOUR NETWORK
Cody runs on your computer and uses your own Claude Code subscription: no API key, no extra bill. The phone reaches it
through your own private Tailscale network, never the public internet. Nothing is sent to the author.

WHAT YOU NEED
Cody running on your computer (free, open source, github.com/baconshow/cody; Windows installer or Python) and the
Tailscale app on this phone. The first run of this app walks you through both and pairs by scanning a QR code.

Unofficial fan project, MIT license. Not affiliated with, endorsed by or sponsored by Anthropic. Claude and Claude
Code are trademarks of Anthropic, PBC.

## Short description (pt-BR)

Seu Claude Code com cara e voz. Avisos no celular. Privado.

## Full description (pt-BR)

O Cody é um bichinho de mesa para o Claude Code. Ele mora no seu computador, e este app traz ele para o seu celular.

DÊ VIDA AO SEU CLAUDE CODE
Um mascote voxel que reage, ao vivo, ao que o Claude está fazendo no seu computador: pega a lupa quando pesquisa,
digita num teclado mini enquanto o Claude edita código, pensa enquanto comandos rodam, acha um inseto quando um teste
falha, solta confete quando uma tarefa longa termina e dorme quando o Claude fecha.

COMANDE O CLAUDE CODE POR VOZ
Diga "Cody" e peça. Suas palavras entram numa sessão de verdade do Claude Code no seu computador, com os seus
arquivos e as suas ferramentas, e o mascote responde em voz alta, em duas frases. Tire dúvidas rápidas sobre o seu
código, peça mudanças ("adiciona um modo escuro na tela de configurações") e aprove o que ele quer rodar com um
"sim" ou "não" falado. Qualquer servidor MCP que você já conectou ao Claude Code responde pelo Cody também. E um
recado para outra conversa ("avisa a minha outra sessão para rodar os testes") chega naquela sessão do Claude,
aberta no mesmo computador, Claude Desktop incluído.

AVISOS, MESMO COM O APP FECHADO
Quando uma tarefa longa termina ou o Claude está esperando a sua permissão, o celular vibra com a cara do Cody e as
palavras, com a tela apagada ou não. Um widget na tela inicial guarda o último aviso.

SAIBA ONDE VOCÊ ESTÁ NO SEU PLANO
"Cody, quanto resta de uso?": a sessão e a semana, ditas em voz alta e mostradas na tela, com a hora em que cada
uma zera. Lido da status line do próprio Claude Code, sem chamada de API.

UM COMPANHEIRO DE MESA POR CIMA
Cronômetros e lembretes que tocam no celular. Uma memória do seu nome e de como você gosta das coisas. "Tira um print
e manda pro meu WhatsApp." Cenas e skins.

SEU, NA SUA REDE
O Cody roda no seu computador e usa a sua própria assinatura do Claude Code: sem chave de API, sem conta extra. O
celular chega até ele pela sua rede privada do Tailscale, nunca pela internet pública. Nada é enviado ao autor.

O QUE VOCÊ PRECISA
O Cody rodando no computador (grátis, código aberto, github.com/baconshow/cody; instalador para Windows ou Python) e
o app do Tailscale neste celular. A primeira abertura deste app guia os dois passos e pareia lendo um QR code.

Projeto de fã, não oficial, licença MIT. Sem afiliação, endosso ou patrocínio da Anthropic. Claude e Claude Code são
marcas da Anthropic, PBC.

## GitHub "About" line (suggested, 350 characters at most)

Bring your Claude Code to life: a desk pet that reacts to what Claude does, takes orders by voice, changes your
code on request and tells your phone when Claude needs you. Unofficial fan project, MIT.

## Graphics (ready, in `docs/media/play/`)

- **App icon**: `web/icon-512.png` (512 x 512).
- **Feature graphic**: `feature-graphic.png` (1024 x 500): the name, the line "A desk pet for Claude Code." and the
  happy mascot.
- **Phone screenshots**: `screenshot-1-coding.png` to `screenshot-5-love.png` (2160 x 1080, 2:1, the page as the
  app shows it lying down: coding with the monitor, Jack-o'-Cody, the Aviator, The Boss, heart eyes). Rendered from
  the real 3D page, with no address or name of anyone in them.
- To make them again (after a skin changes): the script that renders them from a running Cody is in the session
  notes, not in the repository; any screenshot of the page at 2160 x 1080 with `?mood=listening&quiet=1` will do.

## Data safety (draft answers, to check against the form's own questions)

- **Does the app collect or share any of the required user data types?** No data reaches the developer or any
  third party: no account, no ads, no analytics, no crash reporting. The app talks to one place, the computer the
  user paired, over the user's own Tailscale network (HTTPS through Tailscale serve). What it receives from there
  (a heads-up's words, a mood) is shown on the phone and kept only as the last heads-up for the widget.
- **Voice**: the speech recognition is Chrome's own (the page runs in Chrome as a Trusted Web Activity); the app
  itself records nothing. The recognised words go to the user's computer.
- **Is data encrypted in transit?** Yes (HTTPS, and Tailscale's WireGuard underneath).
- **Can users ask for their data to be deleted?** There is nothing held by the developer; clearing the app's data
  removes the paired address and the last heads-up.
- **Permissions to explain**: notifications (the heads-up, opt-in), a foreground service of type `specialUse`
  (the declaration text is in `docs/BACON-TODO.md`), start at boot (to wait on the computer again after a
  restart, only when the heads-up switch is on).

