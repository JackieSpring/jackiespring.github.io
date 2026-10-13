# jackiespring.github.io

Sito statico HTML/CSS, nessuna build richiesta. Ospita gli homework del corso di statistica sotto `/statistics/`.

## Sviluppo locale

Dalla root del repo:

```
python3 -m http.server 8000
```

poi visita `http://localhost:8000/`.

## Struttura

- `index.html` — home
- `statistics/index.html` — elenco homework
- `statistics/homeworkN/index.html` — singolo homework
- `assets/css/style.css` — foglio di stile condiviso
- `assets/img/` — immagini/grafici degli homework

Per aggiungere un nuovo homework: crea `statistics/homeworkN/index.html` (copia una pagina esistente) e aggiungi una card in `statistics/index.html`.
