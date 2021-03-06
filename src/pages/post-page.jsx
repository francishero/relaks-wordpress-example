import _ from 'lodash';
import Moment from 'moment';
import React, { PureComponent } from 'react';
import { AsyncComponent } from 'relaks';
import { Route } from 'routing';
import WordPress from 'wordpress';

import Breadcrumb from 'widgets/breadcrumb';
import PostView from 'widgets/post-view';
import TagList from 'widgets/tag-list';
import CommentSection from 'widgets/comment-section';

class PostPage extends AsyncComponent {
    static displayName = 'PostPage';

    async renderAsync(meanwhile) {
        let { wp, route } = this.props;
        let { postSlug } = route.params;
        let props = { route };
        meanwhile.show(<PostPageSync {...props} />);
        props.post = await wp.fetchPost(postSlug);
        meanwhile.show(<PostPageSync {...props} />);
        props.categories = await this.findCategoryChain(props.post);
        meanwhile.show(<PostPageSync {...props} />);
        props.author = await wp.fetchAuthor(props.post);
        meanwhile.show(<PostPageSync {...props} />);
        props.tags = await wp.fetchTagsOfPost(props.post);
        if (!wp.ssr) {
            meanwhile.show(<PostPageSync {...props} />);
            props.comments = await wp.fetchComments(props.post);
        }
        return <PostPageSync {...props} />;
    }

    async findCategoryChain(post) {
        if (!post) return [];
        let ids = post.categories;
        let { wp, route } = this.props;
        let allCategories = await wp.fetchCategories();

        // add categories, including their parents as well
        let applicable = [];
        let include = (id) => {
            let category = _.find(allCategories, { id })
            if (category) {
                if (!_.includes(applicable, category)) {
                    applicable.push(category);
                }
                // add parent category as well
                include(category.parent);
            }
        };
        for (let id of ids) {
            include(id);
        }

        // see how recently a category was visited
        let historyIndex = (category) => {
            let predicate = { params: { categorySlug: category.slug }};
            return _.findLastIndex(route.history, predicate);
        };
        // see how deep a category is
        let depth = (category) => {
            if (category.parent) {
                let predicate = { id: category.parent };
                let parent = _.find(allCategories, predicate);
                if (parent) {
                    return depth(parent) + 1;
                }
            }
            return 0;
        };

        // order applicable categories based on how recently it was visited,
        // how deep it is, and alphabetically; the first criteria makes our
        // breadcrumb works more sensibly
        applicable = _.orderBy(applicable, [ historyIndex, depth, 'name' ], [ 'desc', 'desc', 'asc' ]);
        let anchorCategory = _.first(applicable);

        let trail = [];
        if (anchorCategory) {
            // add category and its ancestors
            for (let c = anchorCategory; c; c = _.find(applicable, { id: c.parent })) {
                trail.unshift(c);
            }
            // add applicable child categories
            for (let c = anchorCategory; c; c = _.find(applicable, { parent: c.id })) {
                if (c !== anchorCategory) {
                    trail.push(c);
                }
            }
        }
        return trail;
    }
}

class PostPageSync extends PureComponent {
    static displayName = 'PostPageSync';

    render() {
        let { route, categories, post, author, tags, comments } = this.props;
        let trail = [ { label: 'Categories' } ];
        for (let category of categories) {
            let label = _.get(category, 'name', '');
            let url = route.prefetchObjectURL(category);
            trail.push({ label, url });
        }
        return (
            <div className="page">
                <Breadcrumb trail={trail} />
                <PostView post={post} author={author} transform={route.transformNode} />
                <TagList route={route} tags={tags} />
                <CommentSection comments={comments} />
            </div>
        );
    }
}

if (process.env.NODE_ENV !== 'production') {
    const PropTypes = require('prop-types');

    PostPage.propTypes = {
        wp: PropTypes.instanceOf(WordPress),
        route: PropTypes.instanceOf(Route),
    };
    PostPageSync.propTypes = {
        categories: PropTypes.arrayOf(PropTypes.object),
        tags: PropTypes.arrayOf(PropTypes.object),
        post: PropTypes.object,
        author: PropTypes.object,
        comments: PropTypes.arrayOf(PropTypes.object),
        route: PropTypes.instanceOf(Route),
    };
}

export {
    PostPage as default,
    PostPage,
    PostPageSync,
};
