import {
  ASTNode,
  DirectiveNode,
  GraphQLDirective,
  GraphQLFieldConfigMap,
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLSchema,
  isInterfaceType,
  isObjectType,
  getNamedType,
} from 'graphql';
import { transformSchema } from 'apollo-graphql';

export function removeInaccessibleElements(
  schema: GraphQLSchema,
): GraphQLSchema {
  const inaccessibleDirective = schema.getDirective('inaccessible');
  if (!inaccessibleDirective) return schema;

  // We need to compute the types to remove beforehand, because we also need
  // to remove any fields that return a removed type. Otherwise, GraphQLSchema
  // being a graph just means the removed type would be added back.
  const typesToRemove = new Set(
    Object.values(schema.getTypeMap()).filter((type) => {
      // If the type hasn't been built from an AST, it won't have directives.
      // This shouldn't happen, because we only call this function from
      // buildComposedSchema and that builds the schema from the supergraph SDL.
      if (!type.astNode) return false;

      // If the type itself has `@inaccessible`, remove it.
      return hasDirective(inaccessibleDirective, type.astNode);
    }),
  );

  return transformSchema(schema, (type) => {
    // Remove the type.
    if (typesToRemove.has(type)) return null;

    if (isObjectType(type)) {
      const typeConfig = type.toConfig();

      return new GraphQLObjectType({
        ...typeConfig,
        fields: removeInaccessibleFields(typeConfig.fields),
      });
    } else if (isInterfaceType(type)) {
      const typeConfig = type.toConfig();

      return new GraphQLInterfaceType({
        ...typeConfig,
        fields: removeInaccessibleFields(typeConfig.fields),
      });
    } else {
      // Keep the type as is.
      return undefined;
    }
  });

  function removeInaccessibleFields(
    fieldMapConfig: GraphQLFieldConfigMap<any, any>,
  ) {
    const newFieldMapConfig: GraphQLFieldConfigMap<any, any> =
      Object.create(null);

    for (const [fieldName, fieldConfig] of Object.entries(fieldMapConfig)) {
      if (typesToRemove.has(getNamedType(fieldConfig.type))) {
        continue;
      }

      if (
        fieldConfig.astNode &&
        hasDirective(inaccessibleDirective!, fieldConfig.astNode)
      ) {
        continue;
      }

      newFieldMapConfig[fieldName] = fieldConfig;
    }

    return newFieldMapConfig;
  }
}

function hasDirective(
  directiveDef: GraphQLDirective,
  node: { directives?: readonly DirectiveNode[] } & ASTNode,
): boolean {
  if (!node.directives) return false;

  return node.directives.some(
    (directiveNode) => directiveNode.name.value === directiveDef.name,
  );
}