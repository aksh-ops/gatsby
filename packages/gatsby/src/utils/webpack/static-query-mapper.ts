import path from "path"
import { Store } from "redux"
import { Compiler, NormalModule } from "webpack"
import { IGatsbyState } from "../../redux/types"

export class StaticQueryMapper {
  private store: Store<IGatsbyState>
  private name: string

  constructor(store) {
    this.store = store
    this.name = `StaticQueryMapper`
  }

  apply(compiler: Compiler): void {
    const { components, staticQueryComponents } = this.store.getState()

    compiler.hooks.afterCompile.tap(this.name, compilation => {
      if (compilation.compiler.parentCompilation) {
        return
      }

      const staticQueriesByChunkGroup = new Map()
      const gatsbyTemplatesByChunkGroup = new Map()
      compilation.modules.forEach(webpackModule => {
        for (const [, staticQuery] of staticQueryComponents) {
          const staticQueryComponentPath = path.resolve(
            staticQuery.componentPath
          )
          if (
            (webpackModule as NormalModule).resource !==
            staticQueryComponentPath
          ) {
            continue
          }

          if (compilation.chunkGraph) {
            for (const chunk of compilation.chunkGraph.getModuleChunksIterable(
              webpackModule
            )) {
              for (const group of chunk.groupsIterable) {
                const staticQueries = staticQueriesByChunkGroup.get(group) ?? []
                staticQueries.push(staticQuery.hash)
                staticQueriesByChunkGroup.set(group, staticQueries)
              }
            }
          }
        }

        for (const [, component] of components) {
          const componentComponentPath = path.resolve(component.componentPath)
          if (
            (webpackModule as NormalModule).resource !== componentComponentPath
          ) {
            continue
          }

          if (compilation.chunkGraph) {
            for (const chunk of compilation.chunkGraph.getModuleChunksIterable(
              webpackModule
            )) {
              for (const group of chunk.groupsIterable) {
                const templates = gatsbyTemplatesByChunkGroup.get(group) ?? []
                templates.push(component)
                gatsbyTemplatesByChunkGroup.set(group, templates)
              }
            }
          }
        }
      })

      for (const [chunkGroup, staticQueryHashes] of staticQueriesByChunkGroup) {
        if (gatsbyTemplatesByChunkGroup.has(chunkGroup)) {
          const components = gatsbyTemplatesByChunkGroup.get(chunkGroup)

          components.forEach(component => {
            this.store.dispatch({
              type: `ADD_PENDING_TEMPLATE_DATA_WRITE`,
              payload: {
                componentPath: component.componentPath,
                pages: component.pages,
              },
            })

            this.store.dispatch({
              type: `SET_STATIC_QUERIES_BY_TEMPLATE`,
              payload: {
                componentPath: component.componentPath,
                staticQueryHashes,
              },
            })
          })
        }
      }
    })
  }
}
