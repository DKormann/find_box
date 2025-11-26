



type Monad = {
  pure<T>(x: T) : T,
  // bind<T, R>(x: Monad<T>, f: (x: T) => Monad<R>): Monad<R>
}



const Maybe: Monad = {
  pure: (x: T) => ["some", x]
}




const some1 = Maybe.pure(1)



