# some notes



somewhat naive compiler: 96899 runs/s on 200k runs, formula: [not, any, and, get_color, f, eq, get_color, f, right, get_color, f, ]

naive hot app: not clearly slower


## compiled rule

3552397 runs/s on 200k runs, same formula

woowww so fast.

generate JS optimized code for each rule

rule uses only one static allocated array that holds all temporary data as well. the array is allocated at function creation time.


update loop inlining: around 400k

update locals instead of array index: 15000k




failed idea:

wanted to rewrite the graph to only have simple math ops `x2 = x0 + x1` etc so that everything can be simplified



update is not failed actually: 29851 k 
i render all ast nodes down to simple interactions between scalar variables. all move and reduce get rendered to this.
all variables that are used only once are inlined.
cut down massively on used variables. ~ 2x faster!